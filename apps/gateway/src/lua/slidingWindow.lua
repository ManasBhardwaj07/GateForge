-- slidingWindow.lua
-- Atomic sliding window rate limiter for Redis
-- KEYS[1] = key (e.g., rate:<orgId>:<routeId>)
-- ARGV[1] = now (ms timestamp)
-- ARGV[2] = window_ms (e.g., 60000)
-- ARGV[3] = limit (max requests in window)
-- ARGV[4] = requestId (unique string identifier)

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local reqId = ARGV[4] or ""

-- remove expired entries outside the sliding window
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- get current count of accepted requests in active window
local count = redis.call('ZCARD', key)

if limit > 0 and count < limit then
	-- request accepted: add member and update TTL
	local member = ARGV[1] .. ":" .. reqId
	redis.call('ZADD', key, now, member)
	redis.call('PEXPIRE', key, window)
	local remaining = limit - count - 1
	return { 1, remaining }
else
	-- request rejected: do not record rejected attempts in ZSET
	redis.call('PEXPIRE', key, window)
	return { 0, 0 }
end
