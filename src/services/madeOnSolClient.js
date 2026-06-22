const axios = require('axios');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * MADEONSOL API CLIENT
 *
 * Provides market intelligence from KOL (Key Opinion Leader) wallet tracking
 *
 * ETHICAL USE ONLY:
 * - Detect coordinated manipulation (defensive)
 * - Understand market sentiment
 * - Identify suspicious patterns
 *
 * DO NOT USE FOR:
 * - Front-running KOL trades
 * - Blindly copy-trading
 * - Exploiting retail traders
 */

class MadeOnSolClient {
  constructor() {
    this.apiKey = process.env.MADEONSOL_API_KEY;
    this.baseUrl = 'https://api.madeonsol.com/v1';

    if (!this.apiKey) {
      logger.warn('MadeOnSol API key not found. Set MADEONSOL_API_KEY in .env');
      this.enabled = false;
    } else {
      this.enabled = true;
      logger.info('MadeOnSol client initialized');
    }

    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };

    // Rate limiting
    this.requestQueue = [];
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000; // 1 request per second
  }

  /**
   * Rate-limited request wrapper
   */
  async makeRequest(endpoint, params = {}) {
    if (!this.enabled) {
      throw new Error('MadeOnSol API not configured');
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }

    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: this.headers,
        params: params,
        timeout: 10000
      });

      this.lastRequestTime = Date.now();
      return response.data;

    } catch (error) {
      if (error.response) {
        logger.error('MadeOnSol API error:', {
          status: error.response.status,
          endpoint: endpoint,
          message: error.response.data?.message || error.message
        });

        if (error.response.status === 401) {
          throw new Error('Invalid MadeOnSol API key');
        } else if (error.response.status === 429) {
          throw new Error('Rate limit exceeded');
        }
      } else {
        logger.error('MadeOnSol request failed:', error.message);
      }

      throw error;
    }
  }

  /**
   * Get top KOL wallets with reputation scores
   *
   * Returns curated list of influential wallets
   */
  async getTopKOLs(limit = 100) {
    try {
      const data = await this.makeRequest('/kol/list', { limit });

      logger.info('Fetched top KOLs', {
        count: data.kols?.length || 0,
        limit: limit
      });

      return data.kols || [];
    } catch (error) {
      logger.error('Failed to fetch KOLs:', error.message);
      return [];
    }
  }

  /**
   * Track specific KOL wallet activity
   *
   * Get real-time trades from a specific influencer
   */
  async trackKOLWallet(walletAddress) {
    try {
      const data = await this.makeRequest(`/kol/track/${walletAddress}`);

      logger.info('Tracking KOL wallet', {
        wallet: walletAddress,
        recentTrades: data.trades?.length || 0
      });

      return {
        wallet: walletAddress,
        isVerified: data.verified || false,
        reputation: data.reputation || 0,
        recentTrades: data.trades || [],
        holdings: data.holdings || []
      };
    } catch (error) {
      logger.error('Failed to track KOL wallet:', error.message);
      return null;
    }
  }

  /**
   * CRITICAL: Detect coordinated KOL buying
   *
   * This detects when multiple KOLs buy the same token simultaneously
   *
   * DEFENSIVE USE: Identify potential pump-and-dump schemes
   * OFFENSIVE USE (UNETHICAL): Front-run the coordinated pump
   *
   * Use this to AVOID being a victim, not to exploit others
   */
  async detectCoordinatedBuying(tokenAddress) {
    try {
      const data = await this.makeRequest('/signals/coordination', {
        token: tokenAddress
      });

      const buyingKOLs = data.kols || [];

      if (buyingKOLs.length >= 2) {
        logger.warn('⚠️ COORDINATED BUYING DETECTED', {
          token: tokenAddress,
          kolCount: buyingKOLs.length,
          timeWindow: data.timeWindow || '5m',
          suspicionLevel: buyingKOLs.length >= 3 ? 'HIGH' : 'MODERATE'
        });

        return {
          isCoordinated: true,
          kolCount: buyingKOLs.length,
          kols: buyingKOLs,
          timeWindow: data.timeWindow,
          suspicionLevel: buyingKOLs.length >= 3 ? 'HIGH' : 'MODERATE',
          recommendation: this.getCoordinationRecommendation(buyingKOLs.length)
        };
      }

      return {
        isCoordinated: false,
        kolCount: 0,
        recommendation: 'NO_ACTION'
      };

    } catch (error) {
      logger.error('Failed to detect coordination:', error.message);
      return { isCoordinated: false, error: error.message };
    }
  }

  /**
   * Get recommendation based on coordination level
   */
  getCoordinationRecommendation(kolCount) {
    if (kolCount >= 5) {
      return 'EXTREME_CAUTION - Likely pump-and-dump scheme. AVOID or SHORT after peak.';
    } else if (kolCount >= 3) {
      return 'HIGH_CAUTION - Coordinated activity detected. Monitor closely, do not FOMO buy.';
    } else if (kolCount >= 2) {
      return 'MODERATE_CAUTION - Multiple KOLs interested. Verify fundamentals before entering.';
    }
    return 'NO_ACTION';
  }

  /**
   * Get deployer reputation score
   *
   * Check if a token deployer is trustworthy
   * Useful for filtering Pump.fun tokens
   */
  async getDeployerScore(deployerAddress) {
    try {
      const data = await this.makeRequest('/deployer/score', {
        address: deployerAddress
      });

      const score = data.score || 0;
      const tier = this.getDeployerTier(score);

      logger.info('Deployer reputation', {
        address: deployerAddress,
        score: score,
        tier: tier
      });

      return {
        address: deployerAddress,
        score: score,
        tier: tier,
        previousTokens: data.previousTokens || 0,
        rugPulls: data.rugPulls || 0,
        successfulProjects: data.successfulProjects || 0,
        trustworthy: score >= 60
      };

    } catch (error) {
      logger.error('Failed to get deployer score:', error.message);
      return { score: 0, tier: 'UNKNOWN' };
    }
  }

  /**
   * Classify deployer by reputation tier
   */
  getDeployerTier(score) {
    if (score >= 80) return 'EXCELLENT';
    if (score >= 60) return 'GOOD';
    if (score >= 40) return 'AVERAGE';
    if (score >= 20) return 'POOR';
    return 'HIGH_RISK';
  }

  /**
   * Get trending Pump.fun tokens with KOL exposure
   *
   * Find which new tokens are getting KOL attention
   */
  async getTrendingPumpTokens(limit = 20) {
    try {
      const data = await this.makeRequest('/pump/top', { limit });

      const tokens = (data.tokens || []).map(token => ({
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        kolBuyers: token.kolBuyers || 0,
        volume24h: token.volume24h || 0,
        priceChange24h: token.priceChange24h || 0,
        marketCap: token.marketCap || 0,
        deployerScore: token.deployerScore || 0,
        riskLevel: this.assessTokenRisk(token)
      }));

      logger.info('Fetched trending Pump.fun tokens', {
        count: tokens.length,
        highRisk: tokens.filter(t => t.riskLevel === 'HIGH').length
      });

      return tokens;

    } catch (error) {
      logger.error('Failed to fetch trending tokens:', error.message);
      return [];
    }
  }

  /**
   * Assess risk level of a token
   */
  assessTokenRisk(token) {
    let riskScore = 0;

    // High KOL coordination = risky
    if (token.kolBuyers >= 5) riskScore += 40;
    else if (token.kolBuyers >= 3) riskScore += 25;

    // Low deployer score = risky
    if (token.deployerScore < 40) riskScore += 30;

    // Extreme price volatility = risky
    if (Math.abs(token.priceChange24h) > 100) riskScore += 30;

    if (riskScore >= 60) return 'HIGH';
    if (riskScore >= 30) return 'MODERATE';
    return 'LOW';
  }

  /**
   * Monitor multiple KOL wallets for activity
   *
   * Track when any monitored KOL makes a trade
   */
  async monitorKOLs(walletAddresses) {
    try {
      const results = [];

      for (const address of walletAddresses) {
        const activity = await this.trackKOLWallet(address);
        if (activity && activity.recentTrades.length > 0) {
          results.push(activity);
        }
      }

      logger.info('KOL monitoring sweep complete', {
        walletsChecked: walletAddresses.length,
        activeKOLs: results.length
      });

      return results;

    } catch (error) {
      logger.error('KOL monitoring failed:', error.message);
      return [];
    }
  }

  /**
   * Get market intelligence summary
   *
   * Comprehensive view of KOL activity and trending tokens
   */
  async getMarketIntelligence() {
    try {
      const [topKOLs, trendingTokens] = await Promise.all([
        this.getTopKOLs(20),
        this.getTrendingPumpTokens(20)
      ]);

      // Analyze KOL sentiment
      const activeKOLs = topKOLs.filter(kol => kol.recent_activity === true).length;

      // Find high-risk coordinated tokens
      const coordinatedTokens = trendingTokens.filter(t => t.kolBuyers >= 3);

      const intelligence = {
        timestamp: Date.now(),
        marketActivity: {
          activeKOLs: activeKOLs,
          totalKOLs: topKOLs.length,
          activityLevel: activeKOLs / topKOLs.length
        },
        trendingTokens: {
          total: trendingTokens.length,
          highRisk: trendingTokens.filter(t => t.riskLevel === 'HIGH').length,
          coordinated: coordinatedTokens.length
        },
        alerts: this.generateAlerts(coordinatedTokens),
        topTokens: trendingTokens.slice(0, 5)
      };

      logger.info('Market intelligence compiled', {
        activeKOLs: activeKOLs,
        alerts: intelligence.alerts.length
      });

      return intelligence;

    } catch (error) {
      logger.error('Failed to compile market intelligence:', error.message);
      return null;
    }
  }

  /**
   * Generate alerts for suspicious activity
   */
  generateAlerts(coordinatedTokens) {
    const alerts = [];

    for (const token of coordinatedTokens) {
      if (token.kolBuyers >= 5) {
        alerts.push({
          severity: 'CRITICAL',
          type: 'MASS_COORDINATION',
          token: token.symbol,
          message: `${token.kolBuyers} KOLs bought ${token.symbol} - LIKELY PUMP & DUMP`,
          action: 'AVOID or prepare to SHORT after peak'
        });
      } else if (token.kolBuyers >= 3 && token.deployerScore < 40) {
        alerts.push({
          severity: 'HIGH',
          type: 'SUSPICIOUS_COORDINATION',
          token: token.symbol,
          message: `Coordinated buying on low-reputation token ${token.symbol}`,
          action: 'HIGH CAUTION - Do not FOMO'
        });
      }
    }

    return alerts;
  }
}

module.exports = MadeOnSolClient;
