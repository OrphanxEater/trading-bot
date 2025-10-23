require('dotenv').config();

/**
 * Configuration Management
 * Loads and validates environment variables
 */
class Config {
  constructor() {
    this.validate();
  }

  // Solana Network Configuration
  get rpcEndpoint() {
    return process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  }

  get network() {
    return process.env.SOLANA_NETWORK || 'mainnet-beta';
  }

  // Wallet Configuration
  get privateKey() {
    return process.env.PRIVATE_KEY;
  }

  // Trading Configuration
  get inputToken() {
    return process.env.INPUT_TOKEN || 'So11111111111111111111111111111111111111112'; // SOL
  }

  get outputToken() {
    return process.env.OUTPUT_TOKEN || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
  }

  get tradeAmount() {
    return parseFloat(process.env.TRADE_AMOUNT || '0.1');
  }

  get slippageBps() {
    return parseInt(process.env.SLIPPAGE_BPS || '50'); // 0.5%
  }

  // Strategy Configuration
  get strategy() {
    return process.env.STRATEGY || 'threshold'; // threshold, dca
  }

  get buyThreshold() {
    return parseFloat(process.env.BUY_THRESHOLD || '0');
  }

  get sellThreshold() {
    return parseFloat(process.env.SELL_THRESHOLD || '0');
  }

  get priceCheckInterval() {
    return parseInt(process.env.PRICE_CHECK_INTERVAL || '10000'); // 10 seconds
  }

  // DCA Strategy Configuration
  get dcaInterval() {
    return parseInt(process.env.DCA_INTERVAL || '3600000'); // 1 hour
  }

  get dcaAmount() {
    return parseFloat(process.env.DCA_AMOUNT || '0.1');
  }

  // Advanced Settings
  get priorityFee() {
    return parseInt(process.env.PRIORITY_FEE || '1000'); // microLamports
  }

  get maxRetries() {
    return parseInt(process.env.MAX_RETRIES || '3');
  }

  get dryRun() {
    return process.env.DRY_RUN === 'true';
  }

  // Logging
  get logLevel() {
    return process.env.LOG_LEVEL || 'info';
  }

  /**
   * Validate required configuration
   */
  validate() {
    const required = ['PRIVATE_KEY'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate private key format
    if (!this.privateKey.match(/^\[[\d,\s]+\]$/) && !this.privateKey.match(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/)) {
      console.warn('Warning: PRIVATE_KEY should be either a base58 string or a JSON array of numbers');
    }
  }

  /**
   * Display current configuration
   */
  display() {
    return {
      network: this.network,
      rpcEndpoint: this.rpcEndpoint,
      strategy: this.strategy,
      inputToken: this.inputToken,
      outputToken: this.outputToken,
      tradeAmount: this.tradeAmount,
      slippageBps: this.slippageBps,
      priceCheckInterval: this.priceCheckInterval,
      dryRun: this.dryRun,
      priorityFee: this.priorityFee,
    };
  }
}

module.exports = new Config();
