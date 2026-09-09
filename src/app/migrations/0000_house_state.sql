CREATE TABLE `house_state` (
	`owner` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`request_id` text DEFAULT '' NOT NULL
);
