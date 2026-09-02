-- Placeholder sliding window Lua script for Redis
-- Keys/args convention to be defined in gateway implementation
-- Should perform atomic check and return { allowed = 1/0, remaining }
-- slidingWindow.lua
-- KEYS[1] = key (e.g., rate:<hash>:window)
-- ARGV[1] = now (ms)
-- ARGV[2] = window_ms (e.g., 60000)
-- ARGV[3] = limit (max requests in window)

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- remove old entries
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
-- add current
redis.call('ZADD', key, now, tostring(now))
-- get count
local count = redis.call('ZCARD', key)
-- set expiry
redis.call('PEXPIRE', key, window)

local allowed = 0
if count <= limit then
	allowed = 1
end

local remaining = limit - count
if remaining < 0 then remaining = 0 end

return { allowed, remaining }
