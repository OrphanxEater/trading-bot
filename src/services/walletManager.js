const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const logger = require('../utils/logger');

/**
 * Wallet Manager
 * Handles wallet/keypair operations
 */
class WalletManager {
  constructor() {
    this.keypair = null;
  }

  /**
   * Initialize wallet from private key
   */
  initialize(privateKey) {
    try {
      // Support both base58 and JSON array formats
      if (privateKey.startsWith('[')) {
        // JSON array format: [1, 2, 3, ...]
        const secretKey = Uint8Array.from(JSON.parse(privateKey));
        this.keypair = Keypair.fromSecretKey(secretKey);
      } else {
        // Base58 format
        const secretKey = bs58.decode(privateKey);
        this.keypair = Keypair.fromSecretKey(secretKey);
      }

      logger.success('Wallet initialized', {
        publicKey: this.keypair.publicKey.toBase58(),
      });

      return this.keypair;
    } catch (error) {
      logger.error('Failed to initialize wallet', { error: error.message });
      throw new Error(`Wallet initialization failed: ${error.message}`);
    }
  }

  /**
   * Get wallet public key
   */
  getPublicKey() {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }
    return this.keypair.publicKey;
  }

  /**
   * Get keypair
   */
  getKeypair() {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }
    return this.keypair;
  }

  /**
   * Get wallet address as string
   */
  getAddress() {
    return this.getPublicKey().toBase58();
  }
}

module.exports = new WalletManager();
