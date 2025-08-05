-- Initialize pgai development database
-- This script runs when the PostgreSQL container starts for the first time

-- Create additional databases for testing
CREATE DATABASE pgai_test;
CREATE DATABASE pgai_integration_test;

-- Create extensions that we'll need
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Switch to main database
\c pgai_dev;

-- Create extensions in main database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create a function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create development user with limited privileges (for testing connection security)
CREATE USER pgai_dev_user WITH PASSWORD 'dev_password';
GRANT CONNECT ON DATABASE pgai_dev TO pgai_dev_user;
GRANT USAGE ON SCHEMA public TO pgai_dev_user;
GRANT CREATE ON SCHEMA public TO pgai_dev_user;

-- Switch to test database and set up extensions
\c pgai_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Switch to integration test database and set up extensions
\c pgai_integration_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";