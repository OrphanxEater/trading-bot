const { Connection, PublicKey } = require('@solana/web3.js');
const { getAccount, getAssociatedTokenAddress } = require('@solana/spl-token');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * Connection Manager
 * Manages Solana RPC connection and blockchain interactions
 */
class ConnectionManager {
  constructor() {
    this.connection = null;
  }

  /**
   * Initialize connection to Solana network
   */
  initialize(rpcEndpoint) {
    try {
      this.connection = new Connection(rpcEndpoint, 'confirmed');
      logger.success('Connected to Solana network', { endpoint: rpcEndpoint });
      return this.connection;
    } catch (error) {
      logger.error('Failed to connect to Solana', { error: error.message });
      throw error;
    }
  }

  /**
   * Get connection instance
   */
  getConnection() {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }
    return this.connection;
  }

  /**
   * Get SOL balance
   */
  async getSolBalance(publicKey) {
    try {
      const balance = await this.connection.getBalance(publicKey);
      return Helpers.lamportsToSol(balance);
    } catch (error) {
      logger.error('Failed to get SOL balance', { error: error.message });
      throw error;
    }
  }

  /**
   * Get SPL token balance
   */
  async getTokenBalance(walletPublicKey, tokenMintAddress) {
    try {
      const mintPublicKey = new PublicKey(tokenMintAddress);
      const tokenAccountAddress = await getAssociatedTokenAddress(
        mintPublicKey,
        walletPublicKey
      );

      const tokenAccount = await getAccount(this.connection, tokenAccountAddress);
      return tokenAccount.amount.toString();
    } catch (error) {
      // If account doesn't exist, balance is 0
      if (error.message.includes('could not find account')) {
        return '0';
      }
      logger.error('Failed to get token balance', {
        error: error.message,
        tokenMint: tokenMintAddress
      });
      throw error;
    }
  }

  /**
   * Get all balances for a wallet
   */
  async getAllBalances(walletPublicKey, tokens = []) {
    const balances = {};

    // Get SOL balance
    balances.SOL = await this.getSolBalance(walletPublicKey);

    // Get token balances
    for (const token of tokens) {
      try {
        const balance = await this.getTokenBalance(walletPublicKey, token.mint);
        balances[token.symbol] = Helpers.formatTokenAmount(balance, token.decimals);
      } catch (error) {
        balances[token.symbol] = 0;
      }
    }

    return balances;
  }

  /**
   * Check network health
   */
  async checkHealth() {
    try {
      const health = await this.connection.getHealth();
      const slot = await this.connection.getSlot();
      return { healthy: health === 'ok', slot };
    } catch (error) {
      logger.error('Network health check failed', { error: error.message });
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async confirmTransaction(signature, commitment = 'confirmed') {
    try {
      const result = await this.connection.confirmTransaction(signature, commitment);
      return result;
    } catch (error) {
      logger.error('Transaction confirmation failed', {
        signature,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new ConnectionManager();
