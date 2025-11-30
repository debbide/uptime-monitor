-- Fix admin password to admin123
DELETE FROM admin_credentials;
INSERT INTO admin_credentials (id, password_hash) VALUES (1, 'JAvlGPq9JyTdtvBO6x2llnRI1+gxwIyPqCKAn3THIKk=');
