//! `graphql_client` reads the schema and the operation files at compile time but
//! does not register them with Cargo, so a change would not rebuild the crate.

fn main() {
    println!("cargo:rerun-if-changed=../api/schema.graphql");
    println!("cargo:rerun-if-changed=src/features/todos/todos.graphql");
}
