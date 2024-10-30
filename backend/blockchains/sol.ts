// @b/blockchains/sol.ts

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import { generateMnemonic, mnemonicToSeedSync } from "bip39";
import * as ed25519 from "ed25519-hd-key";
import { RedisSingleton } from "@b/utils/redis";
import { differenceInMinutes } from "date-fns";
import { logError } from "@b/utils/logger";
import { decrypt } from "@b/utils/encrypt";
import { models } from "@b/db";
import { walletAttributes } from "@db/wallet";
import { readdirSync } from "fs";
import { storeAndBroadcastTransaction } from "@b/utils/eco/redis/deposit";

type ParsedTransaction = {
  timestamp: string;
  hash: string;
  from: string;
  to: string;
  amount: string;
  confirmations: string;
  status: string;
  isError: string;
  fee: string;
};

class SolanaService {
  private connection: Connection;
  private cacheExpiration: number;
  private chainActive: boolean = false;
  private static instance: SolanaService;

  private constructor(
    connectionUrl: string = SolanaService.getConnectionUrl(
      process.env.SOL_NETWORK || "mainnet"
    ),
    cacheExpirationMinutes: number = 30
  ) {
    this.connection = new Connection(connectionUrl, "confirmed");
    this.cacheExpiration = cacheExpirationMinutes;
  }

  private static getConnectionUrl(network: string): string {
    switch (network) {
      case "mainnet":
        return "https://api.mainnet-beta.solana.com";
      case "testnet":
        return "https://api.testnet.solana.com";
      default:
        throw new Error(`Invalid Solana network: ${network}`);
    }
  }

  /**
   * Singleton instance accessor.
   */
  public static async getInstance(): Promise<SolanaService> {
    if (!SolanaService.instance) {
      SolanaService.instance = new SolanaService();
      await SolanaService.instance.checkChainStatus();
    }
    return SolanaService.instance;
  }

  /**
   * Checks if the chain 'SOL' is active in the ecosystemBlockchain model.
   */
  private async checkChainStatus(): Promise<void> {
    try {
      const currentDir = __dirname; // Get current directory
      const files = readdirSync(currentDir); // Read files in current directory

      // Check if any file starts with 'sol.bin'
      const solBinFile = files.find((file) => file.startsWith("sol.bin"));

      if (solBinFile) {
        this.chainActive = true; // Set chain as active if the file is found
        console.log("Chain 'SOL' is active based on local file check.");
      } else {
        console.error("Chain 'SOL' is not active in ecosystemBlockchain.");
      }
    } catch (error) {
      console.error(`Error checking chain status for 'SOL': ${error.message}`);
      this.chainActive = false;
    }
  }

  /**
   * Throws an error if the chain is not active.
   */
  private ensureChainActive(): void {
    if (!this.chainActive) {
      throw new Error("Chain 'SOL' is not active in ecosystemBlockchain.");
    }
  }

  /**
   * Creates a new Solana wallet.
   */
  createWallet() {
    this.ensureChainActive();
    const mnemonic = generateMnemonic();
    const seed = mnemonicToSeedSync(mnemonic);
    const derivationPath = "m/44'/501'/0'/0'"; // Standard Solana derivation path
    const derivedSeed = ed25519.derivePath(
      derivationPath,
      seed.toString("hex")
    ).key;
    const keypair = Keypair.fromSeed(derivedSeed);
    const address = keypair.publicKey.toBase58();
    const privateKey = Buffer.from(keypair.secretKey).toString("hex");
    const publicKey = keypair.publicKey.toBase58();

    return {
      address,
      data: {
        mnemonic,
        publicKey,
        privateKey,
        derivationPath,
      },
    };
  }

  /**
   * Fetches and parses transactions for a given Solana address.
   * Utilizes caching to optimize performance.
   * @param address Solana wallet address
   */
  async fetchTransactions(address: string): Promise<ParsedTransaction[]> {
    try {
      const cacheKey = `wallet:${address}:transactions:sol`;
      const cachedData = await this.getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      const rawTransactions = await this.fetchSolanaTransactions(address);
      const parsedTransactions = this.parseSolanaTransactions(
        rawTransactions,
        address
      );

      const cacheData = {
        transactions: parsedTransactions,
        timestamp: new Date().toISOString(),
      };
      const redis = RedisSingleton.getInstance();
      await redis.setex(
        cacheKey,
        this.cacheExpiration * 60,
        JSON.stringify(cacheData)
      );

      return parsedTransactions;
    } catch (error) {
      logError("solana_fetch_transactions", error, __filename);
      throw new Error(`Failed to fetch Solana transactions: ${error.message}`);
    }
  }

  /**
   * Fetches raw transactions from Solana for a given address.
   * @param address Solana wallet address
   */
  private async fetchSolanaTransactions(address: string): Promise<any[]> {
    try {
      const publicKey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(
        publicKey,
        { limit: 50 }
      );
      const transactions = await Promise.all(
        signatures.map(async (signatureInfo) => {
          const transaction = await this.connection.getTransaction(
            signatureInfo.signature,
            {
              maxSupportedTransactionVersion: 0,
              commitment: "confirmed",
            }
          );
          return transaction;
        })
      );
      return transactions;
    } catch (error) {
      console.error(`Failed to fetch Solana transactions: ${error.message}`);
      return [];
    }
  }

  /**
   * Parses raw Solana transactions into a standardized format.
   * @param rawTransactions Raw transaction data from Solana
   * @param address Solana wallet address
   */
  private parseSolanaTransactions(
    rawTransactions: any[],
    address: string
  ): ParsedTransaction[] {
    if (!Array.isArray(rawTransactions)) {
      throw new Error(`Invalid raw transactions format for Solana`);
    }

    return rawTransactions
      .filter((tx) => tx !== null && tx.meta !== null) // Ensure transaction and meta are not null
      .map((tx) => {
        const { transaction, meta, blockTime } = tx;
        const hash = transaction.signatures[0]; // Transaction signature serves as the hash
        const timestamp = blockTime ? blockTime * 1000 : Date.now(); // Convert blockTime to milliseconds

        // Determine the status based on Solana-specific error field
        const status = meta.err ? "Failed" : "Success";

        // Initialize transaction variables
        let from = "";
        let to = "";
        let amount = "0";

        // Loop through instructions and identify transfer details
        transaction.message.instructions.forEach((instruction: any) => {
          // Check if it's a transfer instruction on the system program
          if (
            instruction.programId.equals(
              new PublicKey("11111111111111111111111111111111") // System Program ID for SOL transfers
            ) &&
            instruction.parsed?.type === "transfer"
          ) {
            const info = instruction.parsed.info;

            // Identify if the transaction involves the provided address
            if (info.source === address || info.destination === address) {
              from = info.source;
              to = info.destination;
              amount = (info.lamports / 1e9).toString(); // Convert lamports to SOL
            }
          }
        });

        return {
          timestamp: new Date(timestamp).toISOString(),
          hash,
          from,
          to,
          amount,
          confirmations: meta.confirmations?.toString() || "0", // Use confirmations from meta if available
          status,
          isError: status === "Failed" ? "1" : "0",
          fee: (meta.fee / 1e9).toString(), // Transaction fee in SOL (converted from lamports)
        };
      });
  }

  /**
   * Retrieves the balance of a Solana wallet.
   * Utilizes caching to optimize performance.
   * @param address Solana wallet address
   */
  async getBalance(address: string): Promise<string> {
    try {
      const publicKey = new PublicKey(address);
      const balanceLamports = await this.connection.getBalance(publicKey);
      const balanceSOL = (balanceLamports / 1e9).toString(); // Convert lamports to SOL

      return balanceSOL;
    } catch (error) {
      console.error(`Failed to fetch Solana balance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieves cached transaction data if available and not expired.
   * @param cacheKey Redis cache key
   */
  private async getCachedData(
    cacheKey: string
  ): Promise<ParsedTransaction[] | null> {
    const redis = RedisSingleton.getInstance();
    let cachedData: any = await redis.get(cacheKey);
    if (cachedData && typeof cachedData === "string") {
      cachedData = JSON.parse(cachedData);
    }
    if (cachedData) {
      const now = new Date();
      const lastUpdated = new Date(cachedData.timestamp);
      if (differenceInMinutes(now, lastUpdated) < this.cacheExpiration) {
        return cachedData.transactions;
      }
    }
    return null;
  }

  async monitorSolanaDeposits(wallet: walletAttributes, address: string) {
    try {
      const connection = new Connection(
        clusterApiUrl("mainnet-beta"),
        "confirmed"
      );
      const publicKey = new PublicKey(address);

      console.log(
        `[INFO] Starting monitoring for wallet ${wallet.id} on address ${address}`
      );

      // Create a unique inactivity timeout and listener ID for this request
      const timeoutDuration = 60 * 60 * 1000; // 1 hour in milliseconds
      let logsSubscriptionId: any = null;

      // Inactivity timeout handler
      const inactivityTimeout = setTimeout(async () => {
        if (logsSubscriptionId !== null) {
          console.log(
            `[INFO] No activity for 1 hour on account ${address}. Removing listener.`
          );
          await connection.removeOnLogsListener(logsSubscriptionId);
          logsSubscriptionId = null; // Ensure the listener is removed
        }
      }, timeoutDuration);

      // Subscribe to account logs with error handling
      logsSubscriptionId = await connection.onLogs(
        publicKey,
        async (logs, context) => {
          try {
            clearTimeout(inactivityTimeout); // Clear the inactivity timeout for this specific request

            console.log(
              `[INFO] WebSocket triggered for logs on account ${address}, Slot: ${context.slot}`
            );

            // Extract transaction signature from logs
            const transactionSignature = logs.signature;
            if (transactionSignature) {
              console.log(
                `[INFO] Detected transaction signature: ${transactionSignature}`
              );

              // Track the transaction signature
              await this.trackTransactionSignature(
                connection,
                transactionSignature,
                wallet,
                address,
                logsSubscriptionId
              );

              // Remove listener after processing the transaction
              if (logsSubscriptionId !== null) {
                await connection.removeOnLogsListener(logsSubscriptionId);
                logsSubscriptionId = null; // Ensure it's cleaned up
                console.log(
                  `[INFO] Successfully processed deposit and removed listener for account ${address}`
                );
              }
            } else {
              console.error(
                `[ERROR] No transaction signature detected in logs`
              );
            }
          } catch (logError) {
            console.error(
              `[ERROR] Error processing logs for account ${address}: ${logError.message}`
            );
          }
        },
        "confirmed"
      );

      console.log(
        `[INFO] Subscribed to logs on Solana account: ${address}, subscriptionId: ${logsSubscriptionId}`
      );
    } catch (error) {
      console.error(
        `[ERROR] Error monitoring Solana deposits for ${address}: ${error.message}`
      );
    }
  }

  async trackTransactionSignature(
    connection: Connection,
    signature: string,
    wallet: walletAttributes,
    address: string,
    logsSubscriptionId: number
  ) {
    try {
      const maxRetries = 30;
      let retries = 0;
      let transaction: any = null;

      // Retry mechanism to track the transaction status
      while (retries < maxRetries) {
        try {
          transaction = await connection.getTransaction(signature, {
            commitment: "finalized", // Ensure it's fully confirmed
            maxSupportedTransactionVersion: 0,
          });

          if (transaction) {
            console.log(`[INFO] Transaction ${signature} found.`);
            break; // Exit loop if transaction is found
          } else {
            console.log(
              `[INFO] Transaction ${signature} not found. Retrying... (${
                retries + 1
              }/${maxRetries})`
            );
          }
        } catch (error) {
          console.error(
            `[ERROR] Error fetching transaction ${signature}: ${error.message}`
          );
        }

        retries++;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      if (!transaction) {
        console.error(
          `[ERROR] Transaction ${signature} not found after ${maxRetries} retries.`
        );
        return;
      }

      if (!transaction.meta) {
        console.error(
          `[ERROR] Transaction metadata not available for ${signature}`
        );
        return;
      }

      const accountKeys = transaction.transaction.message.accountKeys.map(
        (key: PublicKey) => key.toBase58()
      );

      // Find the index of the wallet address in the accountKeys array
      const walletIndex = accountKeys.findIndex((key) => key === address);
      if (walletIndex === -1) {
        console.error(
          `[ERROR] Wallet address ${address} not found in transaction ${signature}`
        );
        return;
      }

      // Extract the pre and post balances for the wallet address
      const preBalance = transaction.meta.preBalances[walletIndex];
      const postBalance = transaction.meta.postBalances[walletIndex];

      // Calculate the difference to get the received amount
      const balanceDifference = postBalance - preBalance;
      const amountReceived = (balanceDifference / 1e9).toString(); // Convert lamports to SOL

      if (balanceDifference <= 0) {
        console.error(`[ERROR] No SOL received in transaction ${signature}`);
        return;
      }

      console.log(
        `[INFO] Amount received: ${amountReceived} SOL on account ${address}`
      );

      // Now store the transaction and broadcast the transaction with the received amount
      const txDetails = {
        contractType: "NATIVE",
        id: wallet.id,
        chain: "SOL",
        hash: transaction.transaction.signatures[0],
        type: "DEPOSIT",
        from: "N/A", // Optionally, you can extract the sender if needed
        address: address,
        amount: amountReceived,
        gasLimit: "N/A",
        gasPrice: "N/A",
        status: "COMPLETED",
      };

      console.log(
        `[INFO] Storing transaction for wallet ${wallet.id}, amount: ${amountReceived} SOL`
      );

      await storeAndBroadcastTransaction(txDetails, signature);

      console.log(
        `[SUCCESS] Transaction stored and broadcasted for wallet ${wallet.id}`
      );

      // Remove log listener once transaction is processed
      await connection.removeOnLogsListener(logsSubscriptionId);
      console.log(
        `[INFO] Unsubscribed from logs on Solana account: ${address}, subscriptionId: ${logsSubscriptionId}`
      );
    } catch (error) {
      console.error(
        `[ERROR] Error processing Solana transaction ${signature}: ${error.message}`
      );
    }
  }

  async processSolanaTransaction(
    transactionHash: string,
    wallet: walletAttributes,
    address: string
  ) {
    try {
      console.log(
        `[INFO] Fetching transaction ${transactionHash} for address ${address}`
      );

      const connection = new Connection(
        clusterApiUrl("mainnet-beta"),
        "confirmed"
      );

      // Use the new GetVersionedTransactionConfig
      const transaction = await connection.getTransaction(transactionHash, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0, // Use version 0 or adjust as needed
      });

      if (!transaction) {
        console.error(
          `[ERROR] Transaction ${transactionHash} not found on Solana blockchain`
        );
        return;
      }

      if (!transaction.meta) {
        console.error(
          `[ERROR] Transaction metadata not available for ${transactionHash}`
        );
        return;
      }

      // Process the transaction as usual
      let contractType: "NATIVE" | "PERMIT" = "NATIVE";
      let amount = "0";

      const instructions =
        "instructions" in transaction.transaction.message
          ? transaction.transaction.message.instructions
          : transaction.transaction.message.compiledInstructions;

      instructions.forEach((instruction: any) => {
        if (
          instruction.programId &&
          instruction.programId.equals &&
          instruction.programId.equals(
            new PublicKey("11111111111111111111111111111111") // System Program ID for SOL transfers
          ) &&
          instruction.parsed?.type === "transfer"
        ) {
          const info = instruction.parsed.info;
          if (info.destination === address) {
            amount = (info.lamports / 1e9).toString(); // Convert lamports to SOL
            contractType = "NATIVE";
          }
        }
      });

      if (amount === "0") {
        console.error(
          `[ERROR] No SOL received in transaction ${transactionHash}`
        );
        return;
      }

      const txDetails = {
        contractType,
        id: wallet.id,
        chain: "SOL",
        hash: transaction.transaction.signatures[0],
        type: "DEPOSIT",
        from: "N/A",
        to: address,
        amount,
        fee: (transaction.meta.fee / 1e9).toString(), // Convert lamports to SOL
      };

      console.log(
        `[INFO] Storing and broadcasting transaction ${transactionHash} for wallet ${wallet.id}`
      );
      await storeAndBroadcastTransaction(
        txDetails,
        transaction.transaction.signatures[0]
      );

      console.log(
        `[SUCCESS] Processed Solana transaction ${transactionHash}, type: ${contractType}`
      );
    } catch (error) {
      console.error(
        `[ERROR] Error processing Solana transaction ${transactionHash}: ${error.message}`
      );
    }
  }

  async handleSolanaWithdrawal(
    transactionId: string,
    walletId: string,
    amount: number,
    toAddress: string
  ): Promise<void> {
    try {
      const recipient = new PublicKey(toAddress);
      const amountLamports = Math.round(amount * 1e9); // Convert SOL to lamports

      const transactionSignature = await this.transferSol(
        walletId,
        recipient,
        amountLamports
      );

      if (transactionSignature) {
        await models.transaction.update(
          {
            status: "COMPLETED",
            referenceId: transactionSignature,
          },
          {
            where: { id: transactionId },
          }
        );
      } else {
        throw new Error("Failed to receive transaction signature");
      }
    } catch (error) {
      console.error(`Failed to execute Solana withdrawal: ${error.message}`);
      // Update transaction status to 'FAILED'
      await models.transaction.update(
        {
          status: "FAILED",
          description: `Withdrawal failed: ${error.message}`,
        },
        {
          where: { id: transactionId },
        }
      );
      throw error;
    }
  }

  /**
   * Transfers SOL from the custodial wallet to a recipient using the wallet's ID.
   * The wallet's public key (address) is retrieved from the database using the walletId.
   * The private key is fetched from the wallet data for signing the transaction.
   *
   * @param walletId ID of the wallet performing the transfer
   * @param recipient Recipient's public key (Solana address)
   * @param amount Amount of SOL to transfer (in lamports)
   */
  async transferSol(
    walletId: string,
    recipient: PublicKey,
    amount: number
  ): Promise<string> {
    try {
      // Fetch wallet's private key from the walletData table
      const walletData = await models.walletData.findOne({
        where: { walletId, currency: "SOL", chain: "SOL" },
      });

      if (!walletData || !walletData.data) {
        throw new Error("Private key not found for the wallet");
      }

      const decryptedWalletData = JSON.parse(decrypt(walletData.data));
      const privateKey = Buffer.from(decryptedWalletData.privateKey, "hex");
      const custodialWallet = Keypair.fromSecretKey(privateKey);

      // Create a transaction for transferring SOL
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: custodialWallet.publicKey,
          toPubkey: recipient,
          lamports: amount,
        })
      );

      // Fetch a recent blockhash and set it in the transaction
      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = custodialWallet.publicKey;

      // Sign the transaction
      transaction.sign(custodialWallet);

      // Serialize the transaction
      const serializedTransaction = transaction.serialize();

      // Send the transaction
      const signature = await this.connection.sendRawTransaction(
        serializedTransaction
      );

      console.log(`Transaction signature: ${signature}`);

      // Confirm the transaction
      try {
        await this.connection.confirmTransaction(
          {
            signature,
            blockhash,
            lastValidBlockHeight,
          },
          "confirmed"
        );
      } catch (confirmError) {
        console.warn(
          `Transaction confirmation failed: ${confirmError.message}`
        );
        // Do not throw here; we'll check the transaction status below
      }

      // Check the transaction status on the blockchain
      const txResult = await this.connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0, // or null if you support all versions
      });

      if (txResult && txResult.meta && txResult.meta.err === null) {
        console.log(`SOL transfer successful with signature: ${signature}`);
        return signature;
      } else if (txResult && txResult.meta && txResult.meta.err) {
        throw new Error(
          `Transaction failed with error: ${JSON.stringify(txResult.meta.err)}`
        );
      } else {
        throw new Error("Transaction not found or not confirmed");
      }
    } catch (error) {
      logError("solana_transfer_sol", error, __filename);
      throw new Error(`Failed to transfer SOL: ${error.message}`);
    }
  }
}

export default SolanaService;
