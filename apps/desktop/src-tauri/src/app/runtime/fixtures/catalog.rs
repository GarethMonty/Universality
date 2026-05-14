mod cloud;
mod core_sql_cache;
mod extended;

use super::fixture_port;

pub(super) struct FixtureConnectionSeed {
    pub(super) profile: Option<&'static str>,
    pub(super) id: &'static str,
    pub(super) name: &'static str,
    pub(super) engine: &'static str,
    pub(super) family: &'static str,
    pub(super) host: &'static str,
    pub(super) port: Option<u16>,
    pub(super) database: Option<&'static str>,
    pub(super) use_sqlite_fixture: bool,
    pub(super) username: Option<&'static str>,
    pub(super) password: Option<&'static str>,
    pub(super) auth_mechanism: Option<&'static str>,
    pub(super) ssl_mode: Option<&'static str>,
    pub(super) connection_string: Option<&'static str>,
    pub(super) group: &'static str,
    pub(super) color: &'static str,
    pub(super) icon: &'static str,
    pub(super) query_title: &'static str,
    pub(super) query_text: &'static str,
    pub(super) tags: &'static [&'static str],
}

pub(super) fn fixture_connection_seeds() -> Vec<FixtureConnectionSeed> {
    let mut seeds = Vec::new();
    seeds.extend(core_sql_cache::fixture_connection_seeds());
    seeds.extend(extended::fixture_connection_seeds());
    seeds.extend(cloud::fixture_connection_seeds());
    seeds
}
