// withdrawalQueue.ts

import { models } from "@b/db";
import { handleUTXOWithdrawal } from "@b/utils/eco/utxo";
import { handleNotification } from "@b/utils/notifications";
import SolanaService from "@b/blockchains/sol";
import { refundUser } from "@b/utils/eco/wallet";
import { emailQueue } from "@b/utils/emails";
import { handleEvmWithdrawal } from "./withdraw";
import TronService from "@b/blockchains/tron";
import MoneroService from "@b/blockchains/xmr";
// import TonService from "@b/blockchains/ton";

class WithdrawalQueue {
  private static instance: WithdrawalQueue;
  private queue: string[] = [];
  private isProcessing: boolean = false;
  private processingTransactions: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): WithdrawalQueue {
    if (!WithdrawalQueue.instance) {
      WithdrawalQueue.instance = new WithdrawalQueue();
    }
    return WithdrawalQueue.instance;
  }

  public addTransaction(transactionId: string) {
    if (this.processingTransactions.has(transactionId)) {
      // Transaction is already being processed
      return;
    }
    if (!this.queue.includes(transactionId)) {
      this.queue.push(transactionId);
      this.processNext();
    }
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const transactionId = this.queue.shift();

    if (transactionId) {
      try {
        this.processingTransactions.add(transactionId);

        // Fetch the transaction from the database
        const transaction = (await models.transaction.findOne({
          where: {
            id: transactionId,
          },
          include: [
            {
              model: models.wallet,
              as: "wallet",
              where: {
                type: "ECO",
              },
            },
          ],
        })) as unknown as Transaction;

        if (!transaction) {
          console.error(`Transaction ${transactionId} not found.`);
          return;
        }

        if (!transaction.wallet) {
          console.error(`Wallet not found for transaction ${transactionId}`);
          return;
        }

        // Update transaction status to 'PROCESSING' to prevent duplicate processing
        const [updatedCount] = await models.transaction.update(
          {
            status: "PROCESSING",
          },
          {
            where: {
              id: transactionId,
              status: "PENDING",
            },
          }
        );

        // If the transaction was not updated, it means it was already processed or is being processed
        if (updatedCount === 0) {
          return;
        }

        const metadata =
          typeof transaction.metadata === "string"
            ? JSON.parse(transaction.metadata)
            : transaction.metadata;

        if (!metadata || !metadata.chain) {
          throw new Error("Invalid or missing chain in transaction metadata");
        }

        if (["BTC", "LTC", "DOGE", "DASH"].includes(metadata.chain)) {
          await handleUTXOWithdrawal(transaction);
        } else if (metadata.chain === "SOL") {
          const solanaService = await SolanaService.getInstance();

          await solanaService.handleSolanaWithdrawal(
            transactionId,
            transaction.walletId,
            transaction.amount,
            metadata.toAddress
          );
        } else if (metadata.chain === "TRON") {
          const tronService = await TronService.getInstance();

          await tronService.handleTronWithdrawal(
            transactionId,
            transaction.walletId,
            transaction.amount,
            metadata.toAddress
          );
        } else if (metadata.chain === "XMR") {
          const moneroService = await MoneroService.getInstance();

          await moneroService.handleMoneroWithdrawal(
            transactionId,
            transaction.walletId,
            transaction.amount,
            metadata.toAddress
          );
          // } else if (metadata.chain === "TON") {
          //   const tonService = await TonService.getInstance();

          //   await tonService.handleTonWithdrawal(
          //     transactionId,
          //     transaction.walletId,
          //     transaction.amount,
          //     metadata.toAddress
          //   );
        } else {
          await handleEvmWithdrawal(
            transactionId,
            transaction.walletId,
            metadata.chain,
            transaction.amount,
            metadata.toAddress
          );
        }

        // Send email to the user
        const user = await models.user.findOne({
          where: { id: transaction.userId },
        });

        if (user) {
          const wallet = await models.wallet.findOne({
            where: {
              userId: user.id,
              currency: transaction.wallet.currency,
              type: "ECO",
            },
          });

          if (wallet) {
            await sendEcoWithdrawalConfirmationEmail(
              user,
              transaction,
              wallet,
              metadata.toAddress,
              metadata.chain
            );
          }
        }

        // **Admin Profit Recording:**
        if (
          transaction &&
          typeof transaction.fee === "number" &&
          transaction.fee > 0
        ) {
          await models.adminProfit.create({
            amount: transaction.fee,
            currency: transaction.wallet.currency,
            chain: metadata.chain,
            type: "WITHDRAW",
            transactionId: transaction.id,
            description: `Admin profit from withdrawal fee of ${transaction.fee} ${transaction.wallet.currency} for transaction (${transaction.id})`,
          });
        }
      } catch (error) {
        console.error(
          `Failed to process transaction ${transactionId}: ${error.message}`
        );

        // Update transaction status to 'FAILED' to prevent reprocessing
        await models.transaction.update(
          {
            status: "FAILED",
            description: `Transaction failed: ${error.message}`,
          },
          {
            where: { id: transactionId },
          }
        );

        // Refund the user if necessary
        const transaction = await models.transaction.findByPk(transactionId, {
          include: [
            {
              model: models.wallet,
              as: "wallet",
              where: {
                type: "ECO",
              },
            },
          ],
        });
        if (transaction && transaction.wallet) {
          await refundUser(transaction);

          // Send failure email to the user
          const user = await models.user.findOne({
            where: { id: transaction.userId },
          });

          if (user) {
            const metadata =
              typeof transaction.metadata === "string"
                ? JSON.parse(transaction.metadata)
                : transaction.metadata;

            await sendEcoWithdrawalFailedEmail(
              user,
              transaction,
              transaction.wallet,
              metadata.toAddress,
              error.message
            );
          }

          // Optionally, notify the user about the failed withdrawal
          await handleNotification({
            userId: transaction.userId,
            title: "Withdrawal Failed",
            message: `Your withdrawal of ${transaction.amount} ${transaction.wallet.currency} has failed.`,
            type: "ACTIVITY",
          });
        }
      } finally {
        this.processingTransactions.delete(transactionId);
        this.isProcessing = false;
        // Process the next transaction in the queue
        this.processNext();
      }
    } else {
      this.isProcessing = false;
    }
  }
}

export async function sendEcoWithdrawalConfirmationEmail(
  user: any,
  transaction: any,
  wallet: any,
  toAddress: string,
  chain: string
) {
  const emailType = "EcoWithdrawalConfirmation";
  const emailData = {
    TO: user.email,
    FIRSTNAME: user.firstName,
    AMOUNT: transaction.amount.toString(),
    CURRENCY: wallet.currency,
    TO_ADDRESS: toAddress,
    TRANSACTION_ID: transaction.referenceId || transaction.id,
    CHAIN: chain,
  };

  await emailQueue.add({ emailData, emailType });
}

export async function sendEcoWithdrawalFailedEmail(
  user: any,
  transaction: any,
  wallet: any,
  toAddress: string,
  reason: string
) {
  const emailType = "EcoWithdrawalFailed";
  const emailData = {
    TO: user.email,
    FIRSTNAME: user.firstName,
    AMOUNT: transaction.amount.toString(),
    CURRENCY: wallet.currency,
    TO_ADDRESS: toAddress,
    REASON: reason,
  };

  await emailQueue.add({ emailData, emailType });
}

export default WithdrawalQueue;
