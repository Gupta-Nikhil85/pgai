import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock environment variables for tests
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.USER_SERVICE_URL = 'http://localhost:3001';
process.env.ENABLE_METRICS = 'false';

// Global test timeout
jest.setTimeout(30000);

// Mock external dependencies if needed
beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global test cleanup
});

// Suppress console logs during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}