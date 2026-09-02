-- Placeholder atomic monthly quota Lua script for Redis
-- TODO: implement atomic monthly increment + check
-- atomicQuota.lua
-- KEYS[1] = key (e.g., quota:<org>:YYYY-MM)
-- ARGV[1] = increment (1)
-- ARGV[2] = limit (monthly quota, -1 for unlimited)

local key = KEYS[1]
local inc = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

if limit < 0 then
	return {1, -1}
end

local curr = redis.call('GET', key)
if not curr then
	curr = 0
else
	curr = tonumber(curr)
end

local next = curr + inc
if next > limit then
	return {0, curr}
end

redis.call('INCRBY', key, inc)
-- set expiry to 35 days to cover month
redis.call('PEXPIRE', key, 35 * 24 * 60 * 60 * 1000)

return {1, next}
