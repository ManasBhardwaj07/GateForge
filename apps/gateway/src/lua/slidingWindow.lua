-- slidingWindow.lua
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

local member = ARGV[1] .. ":" .. reqId

-- remove old entries
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
-- add current unique member with score = now
redis.call('ZADD', key, now, member)
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
