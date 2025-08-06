// Basic smoke tests for API Gateway
describe('API Gateway', () => {
  it('should be importable', () => {
    const { app } = require('../app');
    expect(app).toBeDefined();
    expect(typeof app).toBe('function');
  });

  it('should have proper configuration', () => {
    const { gatewayConfig } = require('../config');
    expect(gatewayConfig).toBeDefined();
    expect(gatewayConfig.env).toBe('test');
    expect(gatewayConfig.jwt.secret).toBeDefined();
    expect(gatewayConfig.services.user.url).toBeDefined();
  });

  it('should export required utilities', () => {
    const auth = require('../utils/auth');
    const errors = require('../utils/errors');
    const logger = require('../utils/logger');
    const metrics = require('../utils/metrics');

    expect(auth.verifyAccessToken).toBeDefined();
    expect(errors.AppError).toBeDefined();
    expect(logger.logger).toBeDefined();
    expect(metrics.metricsMiddleware).toBeDefined();
  });

  it('should export middleware', () => {
    const authMiddleware = require('../middleware/auth.middleware');
    const errorMiddleware = require('../middleware/error.middleware');
    const securityMiddleware = require('../middleware/security.middleware');

    expect(authMiddleware.authenticate).toBeDefined();
    expect(errorMiddleware.errorHandler).toBeDefined();
    expect(securityMiddleware.requestIdMiddleware).toBeDefined();
  });

  it('should export services', () => {
    const proxyService = require('../services/proxy.service');
    expect(proxyService.proxyService).toBeDefined();
    expect(proxyService.ServiceRegistry).toBeDefined();
  });
});