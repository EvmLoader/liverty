import { logError } from "@b/utils/logger";
import { models } from "@b/db";
import { walletAttributes } from "@db/wallet";
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

type WalletCreationResult = {
  address: string;
  data: {
    mnemonic: string;
  };
};

class MoneroService {
  private daemonRpcUrl: string;
  private walletRpcUrl: string;
  private rpcUser: string | undefined;
  private rpcPassword: string | undefined;
  private walletPassword: string | undefined;
  private chainActive: boolean = false;
  private static monitoredWallets = new Map<string, walletAttributes>(); // Map to track monitored wallets
  private static monitoringTransactions = false; // Whether the wallet transactions are being monitored
  private static processedTransactions = new Set<string>(); // Set to track processed transactions
  private static instance: MoneroService;
  private static queue: (() => Promise<void>)[] = []; // Queue for wallet operations
  private static processing = false; // Whether the queue is currently processing

  private constructor(
    daemonRpcUrl: string = "http://127.0.0.1:18081/json_rpc",
    walletRpcUrl: string = "http://127.0.0.1:18083/json_rpc"
  ) {
    this.daemonRpcUrl = daemonRpcUrl;
    this.walletRpcUrl = walletRpcUrl;
  }

  public static async getInstance(): Promise<MoneroService> {
    if (!MoneroService.instance) {
      MoneroService.instance = new MoneroService();
      await MoneroService.instance.checkChainStatus();
    }
    return MoneroService.instance;
  }

  private static async addToQueue(
    operation: () => Promise<void>
  ): Promise<void> {
    MoneroService.queue.push(operation);
    if (!MoneroService.processing) {
      await MoneroService.processQueue();
    }
  }

  private static async processQueue(): Promise<void> {
    MoneroService.processing = true;
    while (MoneroService.queue.length > 0) {
      const operation = MoneroService.queue.shift(); // Get the next operation
      if (operation) {
        try {
          await operation(); // Execute the queued operation
        } catch (error) {
          console.error(
            `Error processing Monero wallet operation: ${error.message}`
          );
        }
      }
    }
    MoneroService.processing = false;
  }

  private async checkChainStatus(): Promise<void> {
    const status = await this.makeDaemonRpcCall("get_info");
    if (status?.result?.synchronized) {
      this.chainActive = true;
      console.log("Chain 'Monero' is active and synchronized.");
    } else {
      this.chainActive = false;
      console.error("Chain 'Monero' is not synchronized.");
    }
  }

  private async makeDaemonRpcCall(
    method: string,
    params: any = {}
  ): Promise<any> {
    return this.makeRpcCall(this.daemonRpcUrl, method, params);
  }

  private async makeWalletRpcCall(
    method: string,
    params: any = {}
  ): Promise<any> {
    return this.makeRpcCall(this.walletRpcUrl, method, params);
  }

  private async makeRpcCall(
    rpcUrl: string,
    method: string,
    params: any = {}
  ): Promise<any> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: "0",
      method,
      params,
    });

    const auth =
      this.rpcUser && this.rpcPassword
        ? "Basic " +
          Buffer.from(`${this.rpcUser}:${this.rpcPassword}`).toString("base64")
        : "";

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Creates a new Monero wallet.
   */
  public async createWallet(walletName: string): Promise<WalletCreationResult> {
    return new Promise((resolve, reject) => {
      MoneroService.addToQueue(async () => {
        this.ensureChainActive();
        console.log(`Creating Monero wallet: ${walletName}`);

        try {
          // Step 1: Create the wallet
          const response = await this.makeWalletRpcCall("create_wallet", {
            filename: walletName,
            password: this.walletPassword || "",
            language: "English",
          });

          if (response.result) {
            // Log and return important wallet data such as address and mnemonic
            const walletAddress = await this.getAddress();
            const walletMnemonic = await this.getMnemonic();

            console.log(`Monero wallet created. Address: ${walletAddress}`);

            resolve({
              address: walletAddress,
              data: { mnemonic: walletMnemonic },
            });
          } else {
            throw new Error(
              `Failed to create wallet: ${JSON.stringify(response)}`
            );
          }
        } catch (error) {
          reject(error);
        } finally {
          // Ensure that the wallet is closed even if an error occurs
          await this.closeWallet();
        }
      });
    });
  }

  /**
   * Retrieves the balance of a wallet.
   */
  public async getBalance(walletName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      MoneroService.addToQueue(async () => {
        this.ensureChainActive();
        console.log(`Opening wallet: ${walletName}`);

        try {
          // Open the wallet by name
          const openResponse = await this.makeWalletRpcCall("open_wallet", {
            filename: walletName,
            password: this.walletPassword || "",
          });

          // Check if wallet opened successfully
          if (openResponse.result) {
            console.log(`Wallet ${walletName} opened successfully.`);
          } else if (openResponse.error) {
            console.error(
              `Failed to open wallet: ${JSON.stringify(openResponse.error)}`
            );
            reject(
              new Error(
                `Failed to open wallet: ${JSON.stringify(openResponse.error)}`
              )
            );
            return; // Stop further execution if wallet couldn't be opened
          }

          // Add a delay to allow the wallet to fully sync
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay

          // Fetch the wallet balance
          const balanceResponse = await this.makeWalletRpcCall("get_balance", {
            account_index: 0, // Default account
          });

          console.log("Balance response:", balanceResponse);

          if (
            typeof balanceResponse.result?.balance === "number" &&
            balanceResponse.result.balance >= 0
          ) {
            // If the balance is found and it's a valid number, even 0 is acceptable
            const balanceInXMR = (
              balanceResponse.result.balance / 1e12
            ).toString();
            console.log(
              `Balance for wallet ${walletName}: ${balanceInXMR} XMR`
            );
            resolve(balanceInXMR);
          } else {
            throw new Error(
              `Failed to retrieve balance for wallet: ${walletName}`
            );
          }
        } catch (error) {
          console.error("Error fetching wallet balance:", error.message);
          reject(error);
        } finally {
          // Ensure the wallet is closed, even if there's an error
          await this.closeWallet();
        }
      });
    });
  }

  /**
   * Opens a Monero wallet by name.
   */
  private async openWallet(walletName: string): Promise<void> {
    await MoneroService.addToQueue(async () => {
      const response = await this.makeWalletRpcCall("open_wallet", {
        filename: walletName,
        password: this.walletPassword || "",
      });

      if (response.error) {
        throw new Error(
          `Failed to open wallet: ${JSON.stringify(response.error)}`
        );
      }
    });
  }

  /**
   * Closes the currently opened wallet.
   */
  private async closeWallet(): Promise<void> {
    await MoneroService.addToQueue(async () => {
      const response = await this.makeWalletRpcCall("close_wallet");
      if (response.error) {
        throw new Error(
          `Failed to close wallet: ${JSON.stringify(response.error)}`
        );
      }
    });
  }

  /**
   * Fetches the wallet address via wallet RPC.
   */
  private async getAddress(): Promise<string> {
    const response = await this.makeWalletRpcCall("get_address", {
      account_index: 0, // Default account
    });

    if (response.result && response.result.address) {
      return response.result.address;
    } else {
      throw new Error("Failed to retrieve Monero wallet address.");
    }
  }

  /**
   * Fetches the mnemonic for the current wallet via wallet RPC.
   */
  private async getMnemonic(): Promise<string> {
    const response = await this.makeWalletRpcCall("query_key", {
      key_type: "mnemonic",
    });

    if (response.result && response.result.key) {
      return response.result.key;
    } else {
      throw new Error("Failed to retrieve Monero wallet mnemonic.");
    }
  }

  /**
   * Ensures the chain is active.
   */
  private ensureChainActive(): void {
    if (!this.chainActive) {
      throw new Error("Chain 'Monero' is not active.");
    }
  }

  public async ensureWalletExists(walletName: string): Promise<void> {
    try {
      console.log(
        `Checking if wallet ${walletName} exists in directory ./wallets`
      );
      const openResponse = await this.makeWalletRpcCall("open_wallet", {
        filename: walletName,
        password: this.walletPassword || "",
      });

      if (
        openResponse.error &&
        openResponse.error.message.includes("Failed to open wallet")
      ) {
        console.log(`Wallet ${walletName} does not exist. Creating it.`);
        await this.createWallet(walletName);
      } else {
        console.log(`Wallet ${walletName} exists and is ready to use.`);
      }
    } catch (error) {
      logError("monero_ensure_wallet_exists", error, __filename);
      throw new Error(
        `Error ensuring wallet ${walletName} exists: ${error.message}`
      );
    }
  }

  public async monitorMoneroDeposits(wallet: walletAttributes) {
    try {
      if (!MoneroService.monitoredWallets.has(wallet.id)) {
        MoneroService.monitoredWallets.set(wallet.id, wallet);
        console.log(`[INFO] Added wallet ${wallet.id} to monitored wallets.`);
        await this.processMonitoredWallets();
      } else {
        console.log(`[INFO] Wallet ${wallet.id} is already being monitored.`);
      }
    } catch (error) {
      console.error(
        `[ERROR] Error monitoring Monero deposits: ${error.message}`
      );
    }
  }

  /**
   * Removes the wallet from the monitored wallets map.
   */
  public async unmonitorMoneroDeposits(walletId: string) {
    try {
      if (MoneroService.monitoredWallets.has(walletId)) {
        MoneroService.monitoredWallets.delete(walletId);
        console.log(
          `[INFO] Removed wallet ${walletId} from monitored wallets.`
        );
      }
    } catch (error) {
      console.error(
        `[ERROR] Error unmonitoring Monero deposits: ${error.message}`
      );
    }
  }

  /**
   * Process the monitored wallets in the queue, opening each wallet to check for deposits.
   */
  private async processMonitoredWallets() {
    const maxRetries = 60; // Max retries (1 hour of checks every minute)
    const retryInterval = 60000; // 1 minute in milliseconds
    const minConfirmations = 6; // Minimum number of confirmations required for a transaction to be considered confirmed

    for (const wallet of MoneroService.monitoredWallets.values()) {
      let retryCount = 0;

      const checkWalletForDeposits = async () => {
        try {
          await this.openWallet(wallet.id);
          const transfers = await this.makeWalletRpcCall("get_transfers", {
            in: true,
            pending: true,
            account_index: 0,
          });

          if (
            transfers.result &&
            Array.isArray(transfers.result.in) &&
            transfers.result.in.length > 0
          ) {
            for (const tx of transfers.result.in) {
              // Skip transactions already processed (either in DB or memory)
              if (MoneroService.processedTransactions.has(tx.txid)) {
                continue;
              }

              if (tx.confirmations >= minConfirmations) {
                console.log(
                  `[INFO] Found confirmed deposit for wallet ${wallet.id}`
                );
                const depositProcessed = await this.processMoneroTransaction(
                  tx.txid,
                  wallet
                );

                // Unmonitor the wallet only if the deposit was processed successfully
                if (depositProcessed) {
                  await this.unmonitorMoneroDeposits(wallet.id);
                }
              } else {
                console.log(
                  `[INFO] Transaction found for wallet ${wallet.id} but it has only ${tx.confirmations} confirmations.`
                );
              }
            }
          } else {
            console.log(`[INFO] No deposits found for wallet ${wallet.id}.`);
          }

          await this.closeWallet();

          retryCount++;

          if (
            retryCount < maxRetries &&
            MoneroService.monitoredWallets.has(wallet.id)
          ) {
            // Retry after the interval
            setTimeout(checkWalletForDeposits, retryInterval);
          } else if (retryCount >= maxRetries) {
            // Stop monitoring if max retries reached
            console.log(
              `[INFO] Max retries reached for wallet ${wallet.id}. Removing from monitored.`
            );
            await this.unmonitorMoneroDeposits(wallet.id);
          }
        } catch (error) {
          console.error(
            `[ERROR] Error processing wallet ${wallet.id}: ${error.message}`
          );
        }
      };

      checkWalletForDeposits();
    }

    // After processing, stop monitoring until new wallets are added
    if (MoneroService.monitoredWallets.size === 0) {
      console.log("[INFO] No wallets left to monitor.");
      MoneroService.monitoringTransactions = false;
    }
  }

  /**
   * Processes a Monero transaction by storing and broadcasting it.
   */
  private async processMoneroTransaction(
    transactionHash: string,
    wallet: walletAttributes
  ): Promise<boolean> {
    try {
      console.log(`[INFO] Processing Monero transaction ${transactionHash}`);

      // Step 1: Check if the transaction has already been processed (either in DB or memory cache)
      if (MoneroService.processedTransactions.has(transactionHash)) {
        console.log(
          `[INFO] Transaction ${transactionHash} already processed in memory. Skipping.`
        );
        return false; // Skip this transaction
      }

      const existingTransaction = await models.transaction.findOne({
        where: {
          referenceId: transactionHash,
          status: "COMPLETED",
        },
      });

      if (existingTransaction) {
        console.log(
          `[INFO] Transaction ${transactionHash} already processed in DB. Skipping.`
        );
        MoneroService.processedTransactions.add(transactionHash); // Add to in-memory cache
        return false;
      }

      // Proceed with the transaction processing
      const transactionInfo = await this.makeWalletRpcCall(
        "get_transfer_by_txid",
        { txid: transactionHash }
      );

      if (transactionInfo.result && transactionInfo.result.transfer) {
        const transfer = transactionInfo.result.transfer;

        const amount = transfer.amount
          ? (transfer.amount / 1e12).toFixed(8)
          : null;
        const fee = transfer.fee ? (transfer.fee / 1e12).toFixed(8) : null;

        const addresses =
          typeof wallet.address === "string"
            ? JSON.parse(wallet.address)
            : wallet.address;
        const moneroAddress = addresses["XMR"].address;

        if (amount === null || fee === null) {
          throw new Error(
            `Amount or fee is null for transaction ${transactionHash}`
          );
        }

        const txData = {
          contractType: "NATIVE",
          id: wallet.id,
          chain: "XMR",
          hash: transactionHash,
          type: "DEPOSIT",
          from: "N/A",
          address: moneroAddress,
          amount: amount,
          fee: fee,
          status: "COMPLETED",
        };

        console.log("🚀 ~ Processed Monero txData:", txData);

        // Store and broadcast the transaction
        await storeAndBroadcastTransaction(txData, transactionHash);

        // Add the processed transaction to the in-memory cache
        MoneroService.processedTransactions.add(transactionHash);

        return true;
      } else {
        console.error(
          `[ERROR] Transaction ${transactionHash} not found on Monero blockchain`
        );
        return false;
      }
    } catch (error) {
      console.error(
        `[ERROR] Error processing Monero transaction ${transactionHash}: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Fetches and parses transactions for a given Monero wallet.
   * @param walletName The Monero wallet name to fetch transactions for.
   */
  public async fetchTransactions(
    walletName: string
  ): Promise<ParsedTransaction[]> {
    try {
      // Step 1: Ensure the chain is active
      this.ensureChainActive();

      // Step 2: Open the wallet to access its transactions
      await this.openWallet(walletName);

      // Step 3: Fetch transactions using Monero's 'get_transfers' RPC call
      const response = await this.makeWalletRpcCall("get_transfers", {
        in: true, // Fetch incoming transactions
        out: true, // Fetch outgoing transactions
        pending: true, // Fetch pending transactions
        failed: true, // Fetch failed transactions
      });

      if (response.result) {
        const rawTransactions = [
          ...(response.result.in || []),
          ...(response.result.out || []),
          ...(response.result.pending || []),
          ...(response.result.failed || []),
        ];

        // Step 4: Parse raw transactions into the ParsedTransaction format
        const parsedTransactions =
          this.parseMoneroTransactions(rawTransactions);
        return parsedTransactions;
      } else {
        throw new Error(
          `Failed to retrieve transactions for wallet: ${walletName}`
        );
      }
    } catch (error) {
      logError("monero_fetch_transactions", error, __filename);
      throw new Error(`Failed to fetch Monero transactions: ${error.message}`);
    } finally {
      // Ensure the wallet is closed after fetching the transactions
      await this.closeWallet();
    }
  }

  /**
   * Parses Monero transactions into a standardized format.
   * @param rawTransactions Array of raw transaction data from Monero.
   */
  private parseMoneroTransactions(rawTransactions: any[]): ParsedTransaction[] {
    return rawTransactions.map((tx) => ({
      timestamp: new Date(tx.timestamp * 1000).toISOString(),
      hash: tx.txid,
      from: tx.type === "in" ? "N/A" : tx.address, // Monero hides sender address for incoming txs
      to: tx.type === "in" ? tx.address : "N/A", // Monero hides recipient address for outgoing txs
      amount: (tx.amount / 1e12).toFixed(8), // Convert atomic units to XMR
      confirmations: tx.confirmations.toString(),
      status: tx.confirmations > 0 ? "Success" : "Pending",
      isError: tx.failed ? "1" : "0",
      fee: (tx.fee / 1e12).toFixed(8),
    }));
  }

  /**
   * Estimates the fee for a Monero transaction.
   * @param walletName Name of the wallet.
   * @param amount Amount in XMR.
   * @param toAddress Recipient's address.
   * @param priority Transaction priority: 0 (low), 1 (medium), 2 (high).
   */
  public async estimateMoneroFee(
    walletName: string,
    amount: number,
    toAddress: string,
    priority: number = 0 // Transaction priority: 0 (low), 1 (medium), 2 (high)
  ): Promise<number> {
    try {
      // Step 1: Open the wallet
      await this.openWallet(walletName);

      // Step 2: Convert amount to atomic units (Monero uses 12 decimal places)
      const atomicAmount = Math.round(amount * 1e12);

      // Step 3: Simulate the transfer to estimate the fee
      const simulatedTransaction = await this.makeWalletRpcCall("transfer", {
        destinations: [{ amount: atomicAmount, address: toAddress }],
        priority,
        ring_size: 16, // Ensuring valid ring size
        do_not_relay: true, // Simulate only without broadcasting
      });

      // Step 4: Handle missing tx_blob but use fee if available
      if (!simulatedTransaction.result?.tx_blob) {
        console.warn(
          `Simulation failed to generate tx_blob. Using available fee: ${simulatedTransaction.result?.fee}`
        );

        if (simulatedTransaction.result?.fee) {
          return simulatedTransaction.result.fee / 1e12; // Convert from atomic units to XMR
        } else {
          throw new Error(
            "Failed to simulate Monero transaction: No tx_blob or fee available."
          );
        }
      }

      // Step 5: Estimate the fee per byte
      const feeEstimateResponse = await this.makeWalletRpcCall(
        "get_fee_estimate",
        {
          priority: priority,
        }
      );

      const feePerByte = feeEstimateResponse.result?.estimated_fee_per_byte;

      if (!feePerByte) {
        throw new Error(
          "Failed to estimate fee per byte for Monero transaction."
        );
      }

      // Step 6: Calculate the transaction size and estimate the total fee
      const transactionSizeInBytes = Buffer.byteLength(
        simulatedTransaction.result.tx_blob,
        "base64"
      );
      const totalFee = (feePerByte * transactionSizeInBytes) / 1e12; // Convert atomic units to XMR

      return totalFee;
    } catch (error) {
      console.error(`Failed to estimate Monero fee: ${error.message}`);
      throw new Error(
        `Failed to estimate fee for Monero transaction: ${error.message}`
      );
    } finally {
      // Ensure wallet is closed after the operation
      await this.closeWallet();
    }
  }

  /**
   * Handles Monero withdrawal by transferring XMR to the specified address.
   * @param transactionId Transaction ID
   * @param walletId Wallet ID
   * @param amount Amount in XMR
   * @param toAddress Recipient's Tron address
   * @param priority Transaction priority: 0 (low), 1 (medium), 2 (high)
   */
  public async handleMoneroWithdrawal(
    transactionId: string,
    walletId: string,
    amount: number,
    toAddress: string,
    priority: number = 0 // Transaction priority: 0 (low), 1 (medium), 2 (high)
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Open the wallet
        const walletName = walletId;
        await this.openWallet(walletName);

        // Step 1: Execute the transfer
        const transferResponse = await this.makeWalletRpcCall("transfer", {
          destinations: [
            { amount: Math.round(amount * 1e12), address: toAddress },
          ],
          priority: priority,
        });

        if (!transferResponse.result?.tx_hash) {
          throw new Error("Failed to execute Monero transaction.");
        }

        // Update the transaction as completed
        await models.transaction.update(
          { status: "COMPLETED", referenceId: transferResponse.result.tx_hash },
          { where: { id: transactionId } }
        );

        resolve();
      } catch (error) {
        console.error(`Failed to execute Monero withdrawal: ${error.message}`);
        await models.transaction.update(
          {
            status: "FAILED",
            description: `Withdrawal failed: ${error.message}`,
          },
          { where: { id: transactionId } }
        );
        reject(error);
      } finally {
        await this.closeWallet(); // Ensure the wallet is closed
      }
    });
  }

  /**
   * Sends a Monero transaction (withdrawal).
   * @param walletName The wallet to send from.
   * @param destinationAddress The address to send the funds to.
   * @param amountXMR The amount of XMR to send (in XMR, not atomic units).
   */
  public async transferXMR(
    walletName: string,
    destinationAddress: string,
    amountXMR: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      MoneroService.addToQueue(async () => {
        this.ensureChainActive();
        console.log(`Opening wallet: ${walletName} to send transaction.`);

        try {
          // Open the wallet by name
          const openResponse = await this.makeWalletRpcCall("open_wallet", {
            filename: walletName,
            password: this.walletPassword || "",
          });

          if (openResponse.result) {
            console.log(`Wallet ${walletName} opened successfully.`);
          } else {
            throw new Error(`Failed to open wallet: ${walletName}`);
          }

          // Convert amount from XMR to atomic units
          const amountAtomic = Math.round(amountXMR * 1e12);

          // Send the transaction using the 'transfer' method
          const transferResponse = await this.makeWalletRpcCall("transfer", {
            destinations: [
              {
                amount: amountAtomic,
                address: destinationAddress,
              },
            ],
            priority: 0, // Standard priority
            account_index: 0, // Default account
          });

          if (transferResponse.result?.tx_hash) {
            console.log(
              `Transaction successful. TX hash: ${transferResponse.result.tx_hash}`
            );
            resolve(transferResponse.result.tx_hash);
          } else {
            throw new Error(
              `Failed to send transaction: ${JSON.stringify(transferResponse)}`
            );
          }
        } catch (error) {
          console.error("Error sending transaction:", error.message);
          reject(error);
        } finally {
          // Ensure the wallet is closed after the transaction
          await this.closeWallet();
        }
      });
    });
  }
}

export default MoneroService;
