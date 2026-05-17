pub(super) fn is_supported_redis_read_command(command: &str, part_count: usize) -> bool {
    matches!(command, "PING" | "SCAN")
        || matches!(
            command,
            "HGETALL"
                | "GET"
                | "TYPE"
                | "TTL"
                | "PTTL"
                | "STRLEN"
                | "HLEN"
                | "LLEN"
                | "LRANGE"
                | "SCARD"
                | "SSCAN"
                | "ZRANGE"
                | "ZCARD"
                | "XLEN"
                | "XRANGE"
                | "MEMORY"
                | "OBJECT"
                | "JSON.GET"
                | "TS.RANGE"
        ) && part_count > 1
}

pub(super) fn is_redis_write_command(command: &str) -> bool {
    matches!(
        command,
        "APPEND"
            | "BLMOVE"
            | "BLMPOP"
            | "BRPOP"
            | "BRPOPLPUSH"
            | "BZPOPMAX"
            | "BZPOPMIN"
            | "DECR"
            | "DECRBY"
            | "DEL"
            | "EXPIRE"
            | "EXPIREAT"
            | "FLUSHALL"
            | "FLUSHDB"
            | "HDEL"
            | "HINCRBY"
            | "HINCRBYFLOAT"
            | "HMSET"
            | "HSET"
            | "HSETNX"
            | "INCR"
            | "INCRBY"
            | "INCRBYFLOAT"
            | "LINSERT"
            | "LPOP"
            | "LPUSH"
            | "LPUSHX"
            | "LREM"
            | "LSET"
            | "LTRIM"
            | "MSET"
            | "MSETNX"
            | "PERSIST"
            | "PEXPIRE"
            | "PEXPIREAT"
            | "PSETEX"
            | "RENAME"
            | "RENAMENX"
            | "RESTORE"
            | "RPOP"
            | "RPOPLPUSH"
            | "RPUSH"
            | "RPUSHX"
            | "SADD"
            | "SET"
            | "SETEX"
            | "SETNX"
            | "SPOP"
            | "SREM"
            | "UNLINK"
            | "ZADD"
            | "ZINCRBY"
            | "ZPOPMAX"
            | "ZPOPMIN"
            | "ZREM"
    )
}

#[cfg(test)]
mod tests {
    use super::{is_redis_write_command, is_supported_redis_read_command};

    #[test]
    fn redis_command_support_is_validated_before_network_use() {
        assert!(is_supported_redis_read_command("PING", 1));
        assert!(is_supported_redis_read_command("GET", 2));
        assert!(!is_supported_redis_read_command("GET", 1));
        assert!(!is_supported_redis_read_command("EVAL", 2));
        assert!(is_redis_write_command("SET"));
        assert!(is_redis_write_command("DEL"));
    }
}
