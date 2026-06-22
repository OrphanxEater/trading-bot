const logger = require('../utils/logger');
const MadeOnSolClient = require('./madeOnSolClient');

/**
 * KOL ACTIVITY MONITOR
 *
 * Real-time monitoring of Key Opinion Leader wallet activity
 *
 * DEFENSIVE PURPOSE:
 * - Detect pump-and-dump schemes before they peak
 * - Identify tokens being manipulated by coordinated influencer buying
 * - Protect against FOMO by showing the manipulation
 *
 * ALERTS WHEN:
 * - 3+ KOLs buy the same token within 5 minutes
 * - Known low-reputation deployer gets sudden KOL attention
 * - Extreme price volatility + KOL coordination
 */

class KOLMonitor {
  constructor(config) {
    this.config = config;
    this.madeOnSol = new MadeOnSolClient();

    // Monitoring state
    this.monitoredKOLs = [];
    this.tokenAlerts = new Map(); // token -> alert data
    this.recentActivity = [];

    // Configuration
    this.enabled = config.enableKOLTracking || false;
    this.alertThreshold = config.kolAlertThreshold || 3; // 3+ KOLs = alert
    this.coordinationWindow = config.coordinationWindow || 300000; // 5 minutes

    // Alert history (prevent spam)
    this.alertHistory = new Map();
    this.alertCooldown = 1800000; // 30 minutes between same-token alerts

    if (this.enabled) {
      logger.info('KOL Monitor initialized', {
        alertThreshold: this.alertThreshold,
        coordinationWindow: `${this.coordinationWindow / 1000}s`
      });
    } else {
      logger.info('KOL Monitor disabled (set ENABLE_KOL_TRACKING=true to enable)');
    }
  }

  /**
   * Start monitoring KOL activity
   */
  async startMonitoring() {
    if (!this.enabled || !this.madeOnSol.enabled) {
      logger.warn('KOL monitoring not enabled or API not configured');
      return;
    }

    logger.info('🔍 Starting KOL activity monitoring...');

    // Load initial list of top KOLs
    await this.loadKOLWatchlist();

    // Start periodic scanning
    this.monitoringInterval = setInterval(async () => {
      await this.scanKOLActivity();
    }, 60000); // Scan every minute

    logger.info('✓ KOL monitoring active');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      logger.info('KOL monitoring stopped');
    }
  }

  /**
   * Load watchlist of top KOLs to monitor
   */
  async loadKOLWatchlist() {
    try {
      const topKOLs = await this.madeOnSol.getTopKOLs(50);

      this.monitoredKOLs = topKOLs.map(kol => ({
        address: kol.address,
        name: kol.name || 'Unknown',
        reputation: kol.reputation || 0,
        followers: kol.followers || 0
      }));

      logger.info('Loaded KOL watchlist', {
        count: this.monitoredKOLs.length
      });

    } catch (error) {
      logger.error('Failed to load KOL watchlist:', error.message);
    }
  }

  /**
   * Scan all monitored KOLs for recent activity
   */
  async scanKOLActivity() {
    try {
      const walletAddresses = this.monitoredKOLs.map(kol => kol.address);
      const activeKOLs = await this.madeOnSol.monitorKOLs(walletAddresses);

      for (const kolActivity of activeKOLs) {
        await this.processKOLActivity(kolActivity);
      }

      // Check for coordinated buying patterns
      await this.detectCoordination();

    } catch (error) {
      logger.error('KOL activity scan failed:', error.message);
    }
  }

  /**
   * Process activity from a single KOL
   */
  async processKOLActivity(kolActivity) {
    const { wallet, recentTrades } = kolActivity;

    for (const trade of recentTrades) {
      if (trade.type === 'BUY') {
        // Record the buy activity
        this.recentActivity.push({
          kol: wallet,
          token: trade.token,
          amount: trade.amount,
          timestamp: trade.timestamp || Date.now(),
          price: trade.price
        });

        // Cleanup old activity (outside coordination window)
        const cutoff = Date.now() - this.coordinationWindow;
        this.recentActivity = this.recentActivity.filter(
          activity => activity.timestamp > cutoff
        );
      }
    }
  }

  /**
   * Detect coordinated buying across multiple KOLs
   */
  async detectCoordination() {
    // Group recent buys by token
    const tokenBuys = new Map();

    for (const activity of this.recentActivity) {
      if (!tokenBuys.has(activity.token)) {
        tokenBuys.set(activity.token, []);
      }
      tokenBuys.get(activity.token).push(activity);
    }

    // Check each token for coordination
    for (const [token, buys] of tokenBuys.entries()) {
      const uniqueKOLs = new Set(buys.map(b => b.kol));

      if (uniqueKOLs.size >= this.alertThreshold) {
        await this.triggerCoordinationAlert(token, Array.from(uniqueKOLs), buys);
      }
    }
  }

  /**
   * Trigger alert for coordinated buying
   */
  async triggerCoordinationAlert(token, kols, buys) {
    // Check if we recently alerted on this token
    const lastAlert = this.alertHistory.get(token);
    if (lastAlert && (Date.now() - lastAlert) < this.alertCooldown) {
      return; // Still in cooldown period
    }

    // Fetch additional token data
    let deployerScore = 0;
    try {
      const coordination = await this.madeOnSol.detectCoordinatedBuying(token);
      if (coordination.deployerScore) {
        deployerScore = coordination.deployerScore;
      }
    } catch (error) {
      // Continue with limited data
    }

    const alert = {
      type: 'COORDINATED_KOL_BUYING',
      severity: this.calculateSeverity(kols.length, deployerScore),
      token: token,
      kolCount: kols.length,
      kols: kols,
      buys: buys,
      timeWindow: this.coordinationWindow,
      deployerScore: deployerScore,
      timestamp: Date.now(),
      recommendation: this.getAlertRecommendation(kols.length, deployerScore)
    };

    // Store alert
    this.tokenAlerts.set(token, alert);
    this.alertHistory.set(token, Date.now());

    // Log alert
    this.logAlert(alert);

    // Trigger webhooks/notifications if configured
    await this.notifyAlert(alert);

    return alert;
  }

  /**
   * Calculate alert severity
   */
  calculateSeverity(kolCount, deployerScore) {
    if (kolCount >= 5 || deployerScore < 20) {
      return 'CRITICAL';
    } else if (kolCount >= 4 || deployerScore < 40) {
      return 'HIGH';
    } else if (kolCount >= 3) {
      return 'MODERATE';
    }
    return 'LOW';
  }

  /**
   * Get actionable recommendation
   */
  getAlertRecommendation(kolCount, deployerScore) {
    if (kolCount >= 5 && deployerScore < 40) {
      return {
        action: 'AVOID',
        reason: 'Mass coordination on low-reputation token - LIKELY PUMP & DUMP',
        strategy: 'Do NOT buy. Consider shorting after peak if you have the expertise.'
      };
    } else if (kolCount >= 4) {
      return {
        action: 'EXTREME_CAUTION',
        reason: 'Heavy KOL coordination detected',
        strategy: 'High manipulation risk. Only enter if you understand the thesis and have tight stops.'
      };
    } else if (kolCount >= 3) {
      return {
        action: 'CAUTION',
        reason: 'Multiple KOLs coordinating',
        strategy: 'Verify fundamentals. Set stop-loss below entry. Expect volatility.'
      };
    }

    return {
      action: 'MONITOR',
      reason: 'Moderate KOL interest',
      strategy: 'Research token fundamentals before entering'
    };
  }

  /**
   * Log alert to console/file
   */
  logAlert(alert) {
    const emoji = {
      'CRITICAL': '🚨',
      'HIGH': '⚠️',
      'MODERATE': '⚡',
      'LOW': 'ℹ️'
    }[alert.severity] || '📢';

    logger.warn(`${emoji} COORDINATED KOL BUYING DETECTED`, {
      token: alert.token,
      severity: alert.severity,
      kolCount: alert.kolCount,
      deployerScore: alert.deployerScore,
      action: alert.recommendation.action,
      reason: alert.recommendation.reason
    });

    console.log('\n' + '═'.repeat(80));
    console.log(`${emoji} ${alert.severity} ALERT: COORDINATED KOL ACTIVITY`);
    console.log('═'.repeat(80));
    console.log(`Token:          ${alert.token}`);
    console.log(`KOLs Involved:  ${alert.kolCount}`);
    console.log(`Deployer Score: ${alert.deployerScore}/100`);
    console.log(`Time Window:    ${alert.timeWindow / 1000} seconds`);
    console.log(`\n📋 RECOMMENDATION: ${alert.recommendation.action}`);
    console.log(`Reason:         ${alert.recommendation.reason}`);
    console.log(`Strategy:       ${alert.recommendation.strategy}`);
    console.log('═'.repeat(80) + '\n');
  }

  /**
   * Send alert notifications (webhook, Discord, Telegram, etc.)
   */
  async notifyAlert(alert) {
    // Implement webhook/notification logic here
    // Examples:
    // - Send to Discord webhook
    // - Send to Telegram bot
    // - Trigger email alert
    // - Update dashboard

    // Placeholder for future implementation
    logger.info('Alert notification triggered', {
      token: alert.token,
      severity: alert.severity
    });
  }

  /**
   * Get current alerts
   */
  getActiveAlerts() {
    const alerts = Array.from(this.tokenAlerts.values());

    return alerts
      .filter(alert => (Date.now() - alert.timestamp) < 3600000) // Last hour
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      monitoredKOLs: this.monitoredKOLs.length,
      recentActivity: this.recentActivity.length,
      activeAlerts: this.getActiveAlerts().length,
      configuration: {
        alertThreshold: this.alertThreshold,
        coordinationWindow: this.coordinationWindow
      }
    };
  }

  /**
   * Manually check a specific token for KOL coordination
   */
  async checkToken(tokenAddress) {
    try {
      const coordination = await this.madeOnSol.detectCoordinatedBuying(tokenAddress);

      if (coordination.isCoordinated) {
        logger.warn('Coordination detected on token', {
          token: tokenAddress,
          kolCount: coordination.kolCount,
          suspicion: coordination.suspicionLevel
        });
      } else {
        logger.info('No coordination detected', {
          token: tokenAddress
        });
      }

      return coordination;

    } catch (error) {
      logger.error('Token check failed:', error.message);
      return null;
    }
  }
}

module.exports = KOLMonitor;
