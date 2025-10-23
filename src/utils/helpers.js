const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
const BigNumber = require('bignumber.js');

/**
 * Helper Utilities
 */
class Helpers {
  /**
   * Convert lamports to SOL
   */
  static lamportsToSol(lamports) {
    return new BigNumber(lamports).dividedBy(LAMPORTS_PER_SOL).toNumber();
  }

  /**
   * Convert SOL to lamports
   */
  static solToLamports(sol) {
    return new BigNumber(sol).multipliedBy(LAMPORTS_PER_SOL).toNumber();
  }

  /**
   * Format token amount with decimals
   */
  static formatTokenAmount(amount, decimals) {
    return new BigNumber(amount).dividedBy(new BigNumber(10).pow(decimals)).toNumber();
  }

  /**
   * Parse token amount to raw units
   */
  static parseTokenAmount(amount, decimals) {
    return new BigNumber(amount).multipliedBy(new BigNumber(10).pow(decimals)).toFixed(0);
  }

  /**
   * Sleep utility
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Format number with commas
   */
  static formatNumber(num, decimals = 6) {
    return new BigNumber(num).toFixed(decimals);
  }

  /**
   * Calculate percentage change
   */
  static percentageChange(oldPrice, newPrice) {
    return new BigNumber(newPrice)
      .minus(oldPrice)
      .dividedBy(oldPrice)
      .multipliedBy(100)
      .toFixed(2);
  }

  /**
   * Retry logic for async operations
   */
  static async retry(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await this.sleep(delay * (i + 1));
      }
    }
  }

  /**
   * Validate Solana address
   */
  static isValidSolanaAddress(address) {
    try {
      const { PublicKey } = require('@solana/web3.js');
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = Helpers;
