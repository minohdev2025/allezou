CREATE TABLE "job_run" (
	"name" varchar(60) PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" varchar(500),
	"last_report" jsonb
);
