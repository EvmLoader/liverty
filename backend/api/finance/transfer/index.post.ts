import { models, sequelize } from "@b/db";
import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";
import { createError } from "@b/utils/error";
import { getWalletByUserIdAndCurrency } from "@b/utils/eco/wallet";
import {
  sendIncomingTransferEmail,
  sendOutgoingTransferEmail,
} from "@b/utils/emails";
import { updatePrivateLedger } from "./utils";
import { settings } from "../../../..";

export const metadata: OperationObject = {
  summary: "Performs a transfer transaction",
  description:
    "Initiates a transfer transaction for the currently authenticated user",
  operationId: "createTransfer",
  tags: ["Finance", "Transfer"],
  requiresAuth: true,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            fromType: {
              type: "string",
              description: "The type of wallet to transfer from",
            },
            toType: {
              type: "string",
              description: "The type of wallet to transfer to",
            },
            fromCurrency: {
              type: "string",
              description: "The currency to transfer from",
            },
            toCurrency: {
              type: "string",
              description: "The currency to transfer to",
              nullable: true,
            },
            amount: { type: "number", description: "Amount to transfer" },
            transferType: {
              type: "string",
              description: "Type of transfer: client or wallet",
            },
            clientId: {
              type: "string",
              description: "Client UUID for client transfers",
              nullable: true,
            },
          },
          required: [
            "fromType",
            "toType",
            "amount",
            "fromCurrency",
            "transferType",
          ],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Transfer transaction initiated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string", description: "Success message" },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Withdraw Method"),
    500: serverErrorResponse,
  },
};

export default async (data: Handler) => {
  const { user, body } = data;
  if (!user?.id)
    throw createError({ statusCode: 401, message: "Unauthorized" });

  const {
    fromType,
    toType,
    amount,
    transferType,
    clientId,
    fromCurrency,
    toCurrency,
  } = body;

  if (toCurrency === "Select a currency") {
    throw createError({
      statusCode: 400,
      message: "Please select a target currency",
    });
  }

  const userPk = await models.user.findByPk(user.id);
  if (!userPk)
    throw createError({ statusCode: 404, message: "User not found" });

  const fromWallet = await models.wallet.findOne({
    where: {
      userId: user.id,
      currency: fromCurrency,
      type: fromType,
    },
  });
  if (!fromWallet)
    throw createError({ statusCode: 404, message: "Wallet not found" });

  let toWallet: any = null;
  let toUser: any = null;

  if (transferType === "client") {
    ({ toWallet, toUser } = await handleClientTransfer(
      clientId,
      fromCurrency,
      fromType
    ));
  } else {
    toWallet = await handleWalletTransfer(
      user.id,
      fromType,
      toType,
      toCurrency
    );
  }

  const parsedAmount = parseFloat(amount);
  if (fromWallet.balance < parsedAmount)
    throw createError(400, "Insufficient balance");

  const currencyData = await getCurrencyData(fromType, fromCurrency);
  if (!currencyData) throw createError(400, "Invalid wallet type");

  const transaction = await performTransaction(
    transferType,
    fromWallet,
    toWallet,
    parsedAmount,
    fromCurrency,
    toCurrency,
    user.id,
    toUser?.id,
    fromType,
    toType,
    currencyData
  );

  if (transferType === "client") {
    await sendTransferEmails(
      user,
      toUser,
      fromWallet,
      toWallet,
      parsedAmount,
      transaction
    );
  }

  return {
    message: "Transfer initiated successfully",
    fromTransfer: transaction.fromTransfer,
    toTransfer: transaction.toTransfer,
    fromType,
    toType,
    fromCurrency: fromCurrency,
    toCurrency: toCurrency,
  };
};

async function handleWalletTransfer(
  userId: string,
  fromType: "FIAT" | "SPOT" | "ECO" | "FUTURES",
  toType: "FIAT" | "SPOT" | "ECO" | "FUTURES",
  toCurrency: string
) {
  if (fromType === toType)
    throw createError(400, "Cannot transfer to the same wallet type");

  const validTransfers = {
    FIAT: ["SPOT", "ECO"],
    SPOT: ["FIAT", "ECO"],
    ECO: ["FIAT", "SPOT", "FUTURES"],
    FUTURES: ["ECO"],
  };

  if (!validTransfers[fromType] || !validTransfers[fromType].includes(toType))
    throw createError(400, "Invalid wallet type transfer");

  let toWallet = await models.wallet.findOne({
    where: { userId, currency: toCurrency, type: toType },
  });
  if (!toWallet) {
    toWallet = await models.wallet.create({
      userId,
      currency: toCurrency,
      type: toType,
      status: true,
    });
  }

  return toWallet;
}

async function performTransaction(
  transferType: string,
  fromWallet: any,
  toWallet: any,
  parsedAmount: number,
  fromCurrency: string,
  toCurrency: string,
  userId: string,
  clientId: string | null,
  fromType: string,
  toType: string,
  currencyData: any
) {
  return await sequelize.transaction(async (t) => {
    // Retrieve transfer fee percentage from settings
    const walletTransferFeePercentage =
      settings.get("walletTransferFeePercentage") || 0;

    // Calculate the transfer fee based on the percentage
    const transferFeeAmount =
      (parsedAmount * walletTransferFeePercentage) / 100;

    // Total amount deducted from sender's wallet should include the fee
    const totalDeducted = parsedAmount;

    // Amount that the target wallet will receive (net amount after fee deduction)
    const targetReceiveAmount = parsedAmount - transferFeeAmount;

    if (fromWallet.balance < totalDeducted) {
      throw createError(
        400,
        "Insufficient balance to cover transfer and fees."
      );
    }

    const shouldCompleteTransfer = requiresPrivateLedgerUpdate(
      transferType,
      fromType,
      toType
    );
    const fromTransferStatus = shouldCompleteTransfer ? "COMPLETED" : "PENDING";
    const toTransferStatus = shouldCompleteTransfer ? "COMPLETED" : "PENDING";

    if (shouldCompleteTransfer) {
      await handlePrivateLedgerUpdate(
        fromWallet,
        toWallet,
        parsedAmount,
        fromCurrency,
        t
      );
    } else {
      const newFromBalance = parseFloat(
        (fromWallet.balance - totalDeducted).toFixed(
          currencyData.precision || (fromType === "FIAT" ? 2 : 8)
        )
      );
      await fromWallet.update({ balance: newFromBalance }, { transaction: t });

      // Update the recipient's balance only if the transaction is not pending
      if (fromTransferStatus === "COMPLETED") {
        const newToBalance = parseFloat(
          (toWallet.balance + targetReceiveAmount).toFixed(
            currencyData.precision || (toType === "FIAT" ? 2 : 8)
          )
        );
        await toWallet.update({ balance: newToBalance }, { transaction: t });
      }
    }

    // Create transfer records for both sender and recipient
    const fromTransfer = await createTransferTransaction(
      userId,
      fromWallet.id,
      "OUTGOING_TRANSFER",
      parsedAmount,
      transferFeeAmount, // Record the fee in the outgoing transaction
      fromCurrency,
      toCurrency,
      fromWallet.id,
      toWallet.id,
      `Transfer to ${toType} wallet`,
      fromTransferStatus,
      t
    );

    const toTransfer = await createTransferTransaction(
      transferType === "client" ? clientId! : userId,
      toWallet.id,
      "INCOMING_TRANSFER",
      targetReceiveAmount, // Amount received after fee deduction
      0, // No fee for incoming transfer
      fromCurrency,
      toCurrency,
      fromWallet.id,
      toWallet.id,
      `Transfer from ${fromType} wallet`,
      toTransferStatus,
      t
    );

    // **Admin Profit Recording:**
    if (transferFeeAmount > 0) {
      await models.adminProfit.create(
        {
          amount: transferFeeAmount,
          currency: fromCurrency,
          type: "TRANSFER",
          transactionId: fromTransfer.id,
          description: `Transfer fee for user (${userId}) of ${transferFeeAmount} ${fromCurrency} from ${fromType} to ${toType}`,
        },
        { transaction: t }
      );
    }

    return { fromTransfer, toTransfer };
  });
}

async function handleClientTransfer(
  clientId: string,
  currency: string,
  fromType: "FIAT" | "SPOT" | "ECO" | "FUTURES"
) {
  if (!clientId)
    throw createError({ statusCode: 400, message: "Client ID is required" });

  const toUser = await models.user.findByPk(clientId);
  if (!toUser)
    throw createError({ statusCode: 404, message: "Target user not found" });

  let toWallet = await getWalletByUserIdAndCurrency(clientId, currency);
  if (!toWallet) {
    toWallet = await models.wallet.create({
      userId: clientId,
      currency,
      type: fromType,
      status: true,
    });
  }

  return { toWallet, toUser };
}

async function getCurrencyData(fromType: string, currency: string) {
  switch (fromType) {
    case "FIAT":
      return await models.currency.findOne({ where: { id: currency } });
    case "SPOT":
      return await models.exchangeCurrency.findOne({ where: { currency } });
    case "ECO":
    case "FUTURES":
      return await models.ecosystemToken.findOne({ where: { currency } });
  }
}

function requiresPrivateLedgerUpdate(
  transferType: string,
  fromType: string,
  toType: string
) {
  return (
    transferType === "client" ||
    (fromType === "ECO" && toType === "FUTURES") ||
    (fromType === "FUTURES" && toType === "ECO")
  );
}

async function handlePrivateLedgerUpdate(
  fromWallet: any,
  toWallet: any,
  parsedAmount: number,
  currency: string,
  t: any
) {
  const fromAddresses = parseAddresses(fromWallet.address);
  const toAddresses = parseAddresses(toWallet.address);

  let remainingAmount = parsedAmount;

  for (const chain in fromAddresses) {
    if (
      fromAddresses.hasOwnProperty(chain) &&
      fromAddresses[chain].balance > 0
    ) {
      const transferableAmount = Math.min(
        fromAddresses[chain].balance,
        remainingAmount
      );

      // Deduct the transferable amount from the sender's address balance
      fromAddresses[chain].balance -= transferableAmount;

      // Ensure the recipient's chain entry exists othe
      if (!toAddresses[chain]) {
        // Recipient doesn't have an address for this chain
        // Initialize with recipient's own address and network if available, or null
        toAddresses[chain] = {
          address: null, // Keep as null or generate a new address if applicable
          network: null, // Set to null or default network
          balance: 0,
        };
      }

      // Update the recipient's balance for that chain
      toAddresses[chain].balance += transferableAmount;

      // Update the private ledger for both wallets
      await updatePrivateLedger(
        fromWallet.id,
        0,
        currency,
        chain,
        -transferableAmount
      );
      await updatePrivateLedger(
        toWallet.id,
        0,
        currency,
        chain,
        transferableAmount
      );

      remainingAmount -= transferableAmount;
      if (remainingAmount <= 0) break;
    }
  }

  if (remainingAmount > 0)
    throw createError(
      400,
      "Insufficient chain balance to complete the transfer"
    );

  // Update the sender's wallet with the new addresses and balance
  await fromWallet.update(
    {
      address: JSON.stringify(fromAddresses) as any,
      balance: fromWallet.balance - parsedAmount,
    },
    { transaction: t }
  );

  // Update the recipient's wallet with the updated addresses and balance
  await toWallet.update(
    {
      address: JSON.stringify(toAddresses),
      balance: toWallet.balance + parsedAmount,
    },
    { transaction: t }
  );
}

export function parseAddresses(address: any): { [key: string]: any } {
  if (!address) {
    return {};
  }

  if (typeof address === "string") {
    try {
      return JSON.parse(address);
    } catch (error) {
      console.error("Failed to parse address JSON:", error);
      return {};
    }
  }

  if (typeof address === "object") {
    return address;
  }

  return {};
}

export async function processInternalTransfer(
  fromUserId: string,
  toUserId: string,
  currency: string,
  chain: string,
  amount: number
) {
  // Fetch sender's wallet
  const fromWallet = await models.wallet.findOne({
    where: {
      userId: fromUserId,
      currency: currency,
      type: "ECO",
    },
  });

  if (!fromWallet) {
    throw createError({ statusCode: 404, message: "Sender wallet not found" });
  }

  // Fetch or create recipient's wallet
  let toWallet = await models.wallet.findOne({
    where: {
      userId: toUserId,
      currency: currency,
      type: "ECO",
    },
  });

  if (!toWallet) {
    toWallet = await models.wallet.create({
      userId: toUserId,
      currency: currency,
      type: "ECO",
      status: true,
    });
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  if (fromWallet.balance < parsedAmount) {
    throw createError(400, "Insufficient balance.");
  }

  // Retrieve transfer fee percentage from settings
  const walletTransferFeePercentage =
    settings.get("walletTransferFeePercentage") || 0;

  // Calculate the transfer fee
  const transferFeeAmount = (parsedAmount * walletTransferFeePercentage) / 100;

  // Total amount deducted from sender's wallet should include the fee
  const totalDeducted = parsedAmount;

  // Net amount that the recipient will receive after fee deduction
  const targetReceiveAmount = parsedAmount - transferFeeAmount;

  const transaction = await sequelize.transaction(async (t) => {
    // Handle private ledger updates if necessary
    await handlePrivateLedgerUpdate(
      fromWallet,
      toWallet,
      parsedAmount,
      currency,
      t
    );

    // Update the sender's wallet balance by deducting the full amount (including the fee)
    const newFromBalance = parseFloat(
      (fromWallet.balance - totalDeducted).toFixed(8)
    );
    await fromWallet.update({ balance: newFromBalance }, { transaction: t });

    // Update the recipient's wallet balance by adding the net amount
    const newToBalance = parseFloat(
      (toWallet.balance + targetReceiveAmount).toFixed(8)
    );
    await toWallet.update({ balance: newToBalance }, { transaction: t });

    // Create transaction records for both sender and recipient
    const outgoingTransfer = await createTransferTransaction(
      fromUserId,
      fromWallet.id,
      "OUTGOING_TRANSFER",
      parsedAmount,
      transferFeeAmount, // Record the fee in the outgoing transaction
      currency,
      currency,
      fromWallet.id,
      toWallet.id,
      `Internal transfer to user ${toUserId}`,
      "COMPLETED",
      t
    );

    const incomingTransfer = await createTransferTransaction(
      toUserId,
      toWallet.id,
      "INCOMING_TRANSFER",
      targetReceiveAmount, // Amount received after fee deduction
      0, // No fee for incoming transfer
      currency,
      currency,
      fromWallet.id,
      toWallet.id,
      `Internal transfer from user ${fromUserId}`,
      "COMPLETED",
      t
    );

    // Record admin profit only if a fee was charged
    if (transferFeeAmount > 0) {
      await models.adminProfit.create(
        {
          amount: transferFeeAmount,
          currency: currency,
          type: "TRANSFER",
          transactionId: outgoingTransfer.id,
          description: `Internal transfer fee for user (${fromUserId}) of ${transferFeeAmount} ${currency} to user (${toUserId})`,
        },
        { transaction: t }
      );
    }

    // Return the original structure expected by your function
    return { outgoingTransfer, incomingTransfer };
  });

  // Return the same structure as the original implementation
  const userWallet = await models.wallet.findOne({
    where: { userId: fromUserId, currency, type: "ECO" },
  });

  return {
    transaction,
    balance: userWallet?.balance,
    method: chain,
    currency,
  };
}

async function createTransferTransaction(
  userId: string,
  walletId: string,
  type: "INCOMING_TRANSFER" | "OUTGOING_TRANSFER",
  amount: number,
  fee: number, // Include the fee parameter for better clarity
  fromCurrency: string,
  toCurrency: string,
  fromWalletId: string,
  toWalletId: string,
  description: string,
  status: "PENDING" | "COMPLETED",
  transaction: any
) {
  return await models.transaction.create(
    {
      userId,
      walletId,
      type,
      amount,
      fee, // Record the fee in the transaction
      status,
      metadata: JSON.stringify({
        fromWallet: fromWalletId,
        toWallet: toWalletId,
        fromCurrency,
        toCurrency,
      }),
      description,
    },
    { transaction }
  );
}

async function sendTransferEmails(
  user: any,
  toUser: any,
  fromWallet: any,
  toWallet: any,
  amount: number,
  transaction: any
) {
  try {
    await sendOutgoingTransferEmail(
      user,
      toUser,
      fromWallet,
      amount,
      transaction.fromTransfer.id
    );
    await sendIncomingTransferEmail(
      toUser,
      user,
      toWallet,
      amount,
      transaction.toTransfer.id
    );
  } catch (error) {
    console.log("Error sending transfer email: ", error);
  }
}
