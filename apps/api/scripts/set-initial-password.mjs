import argon2 from "argon2";
import { stdin as input, stdout as output } from "node:process";
import { Pool } from "pg";

const args = parseArgs(process.argv.slice(2));

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is required.");
}
if (!args.email) {
  fail("Usage: npm --prefix apps/api run admin:set-password -- --email <email> [--tenant-code <code>] [--platform]");
}
if (!args.platform && !args.tenantCode) {
  fail("Pass --tenant-code for tenant users or --platform for the platform super-admin.");
}

const password = await promptHidden("New password: ");
const confirmation = await promptHidden("Confirm password: ");
if (password !== confirmation) fail("Passwords do not match.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const user = await findUser();
  if (!user) fail("User not found.");

  const policy = user.tenant_id ? await loadTenantPolicy(user.tenant_id) : defaultPlatformPolicy();
  const errors = validatePassword(password, policy);
  if (errors.length) fail(`Password does not satisfy policy: ${errors.join(" ")}`);

  const historicalHashes = await loadPasswordHistory(user.id, user.tenant_id, policy.password_history_count);
  for (const hash of historicalHashes) {
    if (await argon2.verify(hash, password)) {
      fail("Password cannot match the current password or recent password history.");
    }
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  await pool.query("begin");
  await pool.query(
    `
      insert into iam.password_history (user_id, password_hash)
      select id, password_hash
      from iam.users
      where id = $1
        and password_hash is not null
    `,
    [user.id],
  );
  await pool.query(
    `
      update iam.users
      set password_hash = $2,
          status = 'active',
          failed_login_count = 0,
          locked_until = null,
          password_changed_at = now(),
          updated_at = now()
      where id = $1
    `,
    [user.id, passwordHash],
  );
  await pool.query("commit");
  console.info(`Password set for ${args.email}.`);
} catch (error) {
  await pool.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await pool.end();
}

async function findUser() {
  if (args.platform) {
    const result = await pool.query(
      `
        select id, tenant_id
        from iam.users
        where lower(email::text) = lower($1)
          and is_platform_super_admin = true
          and deleted_at is null
      `,
      [args.email],
    );
    return result.rows[0] ?? null;
  }

  const result = await pool.query(
    `
      select u.id, u.tenant_id
      from iam.users u
      join iam.tenants t on t.id = u.tenant_id
      where lower(u.email::text) = lower($1)
        and lower(t.code::text) = lower($2)
        and u.deleted_at is null
    `,
    [args.email, args.tenantCode],
  );
  return result.rows[0] ?? null;
}

async function loadTenantPolicy(tenantId) {
  const result = await pool.query(
    `
      select
        min_length,
        require_uppercase,
        require_lowercase,
        require_number,
        require_special_character,
        password_history_count
      from iam.password_policies
      where tenant_id = $1
    `,
    [tenantId],
  );
  return result.rows[0] ?? defaultPlatformPolicy();
}

async function loadPasswordHistory(userId, tenantId, historyCount) {
  const values = [userId, Math.max(historyCount + 1, 1)];
  const tenantFilter = tenantId ? "and u.tenant_id = $3" : "";
  if (tenantId) values.push(tenantId);

  const result = await pool.query(
    `
      select password_hash
      from (
        select u.password_hash, now() as created_at
        from iam.users u
        where u.id = $1
          ${tenantFilter}
          and u.password_hash is not null
        union all
        select ph.password_hash, ph.created_at
        from iam.password_history ph
        join iam.users u on u.id = ph.user_id
        where u.id = $1
          ${tenantFilter}
        order by created_at desc
        limit $2
      ) hashes
    `,
    values,
  );
  return result.rows.map((row) => row.password_hash);
}

function defaultPlatformPolicy() {
  return {
    min_length: 12,
    require_uppercase: true,
    require_lowercase: true,
    require_number: true,
    require_special_character: true,
    password_history_count: 5,
  };
}

function validatePassword(password, policy) {
  const errors = [];
  if (password.length < policy.min_length) errors.push(`Password must be at least ${policy.min_length} characters.`);
  if (policy.require_uppercase && !/[A-Z]/.test(password)) errors.push("Password must contain an uppercase letter.");
  if (policy.require_lowercase && !/[a-z]/.test(password)) errors.push("Password must contain a lowercase letter.");
  if (policy.require_number && !/[0-9]/.test(password)) errors.push("Password must contain a number.");
  if (policy.require_special_character && !/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must contain a special character.");
  }
  return errors;
}

async function promptHidden(prompt) {
  output.write(prompt);

  if (!input.isTTY) {
    return new Promise((resolve) => {
      let value = "";
      input.on("data", (chunk) => {
        value += chunk.toString("utf8");
        if (value.includes("\n")) resolve(value.trimEnd());
      });
    });
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;

    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      output.write("\n");
    };

    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Password prompt cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--platform") {
      parsed.platform = true;
    } else if (arg === "--email") {
      parsed.email = rawArgs[index + 1];
      index += 1;
    } else if (arg === "--tenant-code") {
      parsed.tenantCode = rawArgs[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
