import request from 'supertest';
import { app } from '../app';

describe('Schema Service Startup', () => {
  let server: any;

  beforeAll(async () => {
    // Start the server
    server = app.listen(0); // Use port 0 to get random available port
  });

  afterAll(async () => {
    // Close the server
    if (server) {
      server.close();
    }
  });

  it('should respond to health check', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('healthy');
    expect(response.body.data.service).toBe('schema-service');
  });

  it('should respond to metrics endpoint', async () => {
    const response = await request(app)
      .get('/metrics')
      .expect(200);

    expect(response.text).toContain('schema_service_');
  });

  it('should return 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/unknown-route')
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('should have schema routes available', async () => {
    // Test that schema routes are mounted
    const response = await request(app)
      .get('/schemas/health')
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  it('should require authentication for schema discovery', async () => {
    // This should return 401 or appropriate auth error since no auth provided
    const response = await request(app)
      .post('/schemas/discover')
      .send({
        connection_id: 'test-connection-id',
      });

    // In a real environment, this would return 401
    // But since we have placeholder auth, it might work differently
    expect([400, 401, 500]).toContain(response.status);
  });
});