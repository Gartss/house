CREATE TABLE `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL UNIQUE,
  `password_hash` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE TABLE `account_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `expires_at` integer NOT NULL
);
