use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl CommandError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl From<std::io::Error> for CommandError {
    fn from(error: std::io::Error) -> Self {
        Self::new("io-error", error.to_string())
    }
}

impl From<serde_json::Error> for CommandError {
    fn from(error: serde_json::Error) -> Self {
        Self::new("serialization-error", error.to_string())
    }
}

impl From<base64::DecodeError> for CommandError {
    fn from(error: base64::DecodeError) -> Self {
        Self::new("decode-error", error.to_string())
    }
}

impl From<sqlx::Error> for CommandError {
    fn from(error: sqlx::Error) -> Self {
        Self::new("sql-execution-error", error.to_string())
    }
}

impl From<mongodb::error::Error> for CommandError {
    fn from(error: mongodb::error::Error) -> Self {
        Self::new("mongodb-error", error.to_string())
    }
}

impl From<mongodb::bson::ser::Error> for CommandError {
    fn from(error: mongodb::bson::ser::Error) -> Self {
        Self::new("bson-serialization-error", error.to_string())
    }
}

impl From<mongodb::bson::de::Error> for CommandError {
    fn from(error: mongodb::bson::de::Error) -> Self {
        Self::new("bson-deserialization-error", error.to_string())
    }
}

impl From<redis::RedisError> for CommandError {
    fn from(error: redis::RedisError) -> Self {
        Self::new("redis-error", error.to_string())
    }
}

impl From<tiberius::error::Error> for CommandError {
    fn from(error: tiberius::error::Error) -> Self {
        Self::new("sqlserver-error", error.to_string())
    }
}
