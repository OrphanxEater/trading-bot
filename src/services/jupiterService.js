const axios = require('axios');
const {
  VersionedTransaction,
  TransactionMessage,
  PublicKey
} = require('@solana/web3.js');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * Jupiter Service
 * Handles DEX operations via Jupiter Aggregator API
 */
class JupiterService {
  constructor() {
    this.baseUrl = 'https://quote-api.jup.ag/v6';
  }

  /**
   * Get quote for a swap
   * @param {string} inputMint - Input token mint address
   * @param {string} outputMint - Output token mint address
   * @param {number} amount - Amount in smallest units (lamports/token units)
   * @param {number} slippageBps - Slippage in basis points (50 = 0.5%)
   */
  async getQuote(inputMint, outputMint, amount, slippageBps = 50) {
    try {
      const params = {
        inputMint,
        outputMint,
        amount: Math.floor(amount).toString(),
        slippageBps,
      };

      logger.debug('Fetching quote from Jupiter', params);

      const response = await axios.get(`${this.baseUrl}/quote`, { params });

      if (!response.data) {
        throw new Error('No quote data received');
      }

      const quote = response.data;

      logger.info('Quote received', {
        inputAmount: Helpers.formatTokenAmount(quote.inAmount, 9),
        outputAmount: Helpers.formatTokenAmount(quote.outAmount, 6),
        priceImpact: quote.priceImpactPct,
      });

      return quote;
    } catch (error) {
      logger.error('Failed to get quote', {
        error: error.message,
        inputMint,
        outputMint,
      });
      throw error;
    }
  }

  /**
   * Get swap transaction
   * @param {object} quote - Quote object from getQuote
   * @param {string} userPublicKey - User's wallet public key
   * @param {number} priorityFee - Priority fee in microLamports
   */
  async getSwapTransaction(quote, userPublicKey, priorityFee = 1000) {
    try {
      const payload = {
        quoteResponse: quote,
        userPublicKey: userPublicKey,
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: priorityFee,
      };

      logger.debug('Getting swap transaction', { userPublicKey });

      const response = await axios.post(`${this.baseUrl}/swap`, payload);

      if (!response.data || !response.data.swapTransaction) {
        throw new Error('No swap transaction received');
      }

      return response.data.swapTransaction;
    } catch (error) {
      logger.error('Failed to get swap transaction', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a swap
   * @param {Connection} connection - Solana connection
   * @param {Keypair} wallet - User's wallet keypair
   * @param {string} inputMint - Input token mint
   * @param {string} outputMint - Output token mint
   * @param {number} amount - Amount to swap (in smallest units)
   * @param {number} slippageBps - Slippage tolerance
   * @param {number} priorityFee - Priority fee
   */
  async executeSwap(connection, wallet, inputMint, outputMint, amount, slippageBps, priorityFee) {
    try {
      logger.info('Starting swap execution', {
        inputMint,
        outputMint,
        amount,
      });

      // Get quote
      const quote = await this.getQuote(inputMint, outputMint, amount, slippageBps);

      // Get swap transaction
      const swapTransactionBuf = await this.getSwapTransaction(
        quote,
        wallet.publicKey.toBase58(),
        priorityFee
      );

      // Deserialize transaction
      const swapTransactionBuffer = Buffer.from(swapTransactionBuf, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuffer);

      // Sign transaction
      transaction.sign([wallet]);

      // Send transaction
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      logger.info('Transaction sent', { signature });

      // Confirm transaction
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      logger.success('Swap executed successfully', {
        signature,
        inputAmount: Helpers.formatTokenAmount(quote.inAmount, 9),
        outputAmount: Helpers.formatTokenAmount(quote.outAmount, 6),
      });

      return {
        signature,
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        quote,
      };
    } catch (error) {
      logger.error('Swap execution failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get current price for a token pair
   * @param {string} inputMint - Input token mint
   * @param {string} outputMint - Output token mint
   * @param {number} baseAmount - Base amount to check price (default 1 SOL = 1e9 lamports)
   */
  async getPrice(inputMint, outputMint, baseAmount = 1e9) {
    try {
      const quote = await this.getQuote(inputMint, outputMint, baseAmount, 50);

      const price = parseFloat(quote.outAmount) / parseFloat(quote.inAmount);

      return {
        price,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct,
      };
    } catch (error) {
      logger.error('Failed to get price', { error: error.message });
      throw error;
    }
  }
}

module.exports = new JupiterService();
