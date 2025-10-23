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
    return process.env.STRATEGY || 'threshold'; // threshold, dca, momentum, grid
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

  // Momentum Strategy Configuration
  get rsiPeriod() {
    return parseInt(process.env.RSI_PERIOD || '14');
  }

  get rsiOversold() {
    return parseFloat(process.env.RSI_OVERSOLD || '30');
  }

  get rsiOverbought() {
    return parseFloat(process.env.RSI_OVERBOUGHT || '70');
  }

  get momentumThreshold() {
    return parseFloat(process.env.MOMENTUM_THRESHOLD || '2.0');
  }

  get confirmationRequired() {
    return process.env.CONFIRMATION_REQUIRED || 'true';
  }

  get trailingStopPercent() {
    return parseFloat(process.env.TRAILING_STOP_PERCENT || '5.0');
  }

  // Grid Strategy Configuration
  get gridLevels() {
    return parseInt(process.env.GRID_LEVELS || '10');
  }

  get gridSpacing() {
    return parseFloat(process.env.GRID_SPACING || '2.0');
  }

  get gridUpperPrice() {
    return parseFloat(process.env.GRID_UPPER_PRICE || '0');
  }

  get gridLowerPrice() {
    return parseFloat(process.env.GRID_LOWER_PRICE || '0');
  }

  get gridOrderSize() {
    return parseFloat(process.env.GRID_ORDER_SIZE || '0.01');
  }

  // Risk Management Configuration
  get maxDrawdown() {
    return parseFloat(process.env.MAX_DRAWDOWN || '0.2'); // 20%
  }

  get maxPositionSize() {
    return parseFloat(process.env.MAX_POSITION_SIZE || '0.25'); // 25%
  }

  get kellyFraction() {
    return parseFloat(process.env.KELLY_FRACTION || '0.25'); // 1/4 Kelly
  }

  get maxDailyLoss() {
    return parseFloat(process.env.MAX_DAILY_LOSS || '0.1'); // 10%
  }

  get enableRiskManagement() {
    return process.env.ENABLE_RISK_MANAGEMENT === 'true';
  }

  get enablePerformanceTracking() {
    return process.env.ENABLE_PERFORMANCE_TRACKING !== 'false'; // Enabled by default
  }

  // Intelligent Analysis Configuration
  get enableIntelligentAnalysis() {
    return process.env.ENABLE_INTELLIGENT_ANALYSIS !== 'false'; // Enabled by default
  }

  get analysisLookbackHours() {
    return parseInt(process.env.ANALYSIS_LOOKBACK_HOURS || '8');
  }

  // NFT Trading Configuration
  get enableNFTTrading() {
    return process.env.ENABLE_NFT_TRADING === 'true';
  }

  get nftBidSpread() {
    return parseFloat(process.env.NFT_BID_SPREAD || '3.0'); // 3% below floor
  }

  get nftAskSpread() {
    return parseFloat(process.env.NFT_ASK_SPREAD || '3.0'); // 3% above floor
  }

  get nftMaxPositions() {
    return parseInt(process.env.NFT_MAX_POSITIONS || '3');
  }

  get nftRebalanceInterval() {
    return parseInt(process.env.NFT_REBALANCE_INTERVAL || '3600000'); // 1 hour
  }

  // Portfolio Management
  get reserveRatio() {
    return parseFloat(process.env.RESERVE_RATIO || '0.1'); // 10% reserve
  }

  // HFT Grid Trading Configuration
  get hftGridLevels() {
    return parseInt(process.env.HFT_GRID_LEVELS || '20');
  }

  get hftGridSpacing() {
    return parseFloat(process.env.HFT_GRID_SPACING || '0.5');
  }

  get hftRebalanceInterval() {
    return parseInt(process.env.HFT_REBALANCE_INTERVAL || '500');
  }

  get hftMinProfitBps() {
    return parseInt(process.env.HFT_MIN_PROFIT_BPS || '10');
  }

  get hftMaxSlippageBps() {
    return parseInt(process.env.HFT_MAX_SLIPPAGE_BPS || '5');
  }

  get hftOrderSize() {
    return parseFloat(process.env.HFT_ORDER_SIZE || '0.01');
  }

  // Pairs Trading Configuration
  get pairsTokenA() {
    return process.env.PAIRS_TOKEN_A || 'So11111111111111111111111111111111111111112';
  }

  get pairsTokenB() {
    return process.env.PAIRS_TOKEN_B || 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';
  }

  get pairsTokenASymbol() {
    return process.env.PAIRS_TOKEN_A_SYMBOL || 'SOL';
  }

  get pairsTokenBSymbol() {
    return process.env.PAIRS_TOKEN_B_SYMBOL || 'mSOL';
  }

  get pairsEntryZScore() {
    return parseFloat(process.env.PAIRS_ENTRY_Z_SCORE || '2.0');
  }

  get pairsExitZScore() {
    return parseFloat(process.env.PAIRS_EXIT_Z_SCORE || '0.5');
  }

  get pairsUpdateInterval() {
    return parseInt(process.env.PAIRS_UPDATE_INTERVAL || '5000');
  }

  get pairsHedgeRatioUpdate() {
    return parseInt(process.env.PAIRS_HEDGE_RATIO_UPDATE || '20');
  }

  get pairsPositionSize() {
    return parseFloat(process.env.PAIRS_POSITION_SIZE || '0.1');
  }

  get pairsProcessNoise() {
    return parseFloat(process.env.PAIRS_PROCESS_NOISE || '0.0001');
  }

  get pairsMeasurementNoise() {
    return parseFloat(process.env.PAIRS_MEASUREMENT_NOISE || '0.01');
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
