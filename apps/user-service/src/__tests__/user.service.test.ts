// Basic smoke tests for UserService
describe('UserService', () => {
  it('should be importable', () => {
    const { UserService } = require('../services/user.service');
    expect(UserService).toBeDefined();
    expect(typeof UserService).toBe('function');
  });

  it('should have expected methods', () => {
    const { UserService } = require('../services/user.service');
    const methods = [
      'createUser',
      'authenticateUser', 
      'refreshToken',
      'getUserProfile',
      'updateUser',
      'changePassword',
      'invalidateRefreshTokens',
      'deleteUser'
    ];
    
    methods.forEach(method => {
      expect(UserService.prototype[method]).toBeDefined();
    });
  });
});