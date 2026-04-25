use tiberius::{AuthMethod, Client as SqlServerClient, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

use super::super::super::*;

pub(super) async fn sqlserver_client(
    connection: &ResolvedConnectionProfile,
) -> Result<SqlServerClient<tokio_util::compat::Compat<TcpStream>>, CommandError> {
    let mut config = if let Some(connection_string) = &connection.connection_string {
        Config::from_ado_string(connection_string)?
    } else {
        let mut config = Config::new();
        config.host(connection.host.clone());
        config.port(connection.port.unwrap_or(1433));

        if let Some(database) = &connection.database {
            config.database(database);
        }

        if let Some(username) = &connection.username {
            config.authentication(AuthMethod::sql_server(
                username.clone(),
                connection.password.clone().unwrap_or_default(),
            ));
        }

        config
    };

    config.trust_cert();
    let tcp = TcpStream::connect(config.get_addr()).await?;
    tcp.set_nodelay(true)?;
    let client = SqlServerClient::connect(config, tcp.compat_write()).await?;
    Ok(client)
}
