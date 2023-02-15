//! Utility to convert TypeScript definitions to Rust code.
//!
//! # The Plan
//!
//! Use deno/swc to parse TypeScript d.ts files and spit out wasm_bindgen
//! compatible Rust code.

use clap::Parser;
use deno_ast::swc::ast::{TsInterfaceDecl, TsTypeElement, TsType, TsMethodSignature, TsTypeParam};
use deno_ast::{parse_module, ParseParams, SourceTextInfo};
use quote::quote;
use syn::parse_quote;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

/// Trait to convert TypeScript definitions to Rust code
pub trait Ts2Rs {
    type Out;
    /// Convert TypeScript definitions to Rust code
    fn ts2rs(&self) -> Self::Out;
}

/// Convert TypeScript definitions to Rust code
#[derive(Debug, Parser)]
#[command(author, version, about)]
struct Cmd {
    /// Input file
    input: PathBuf,
    // Output file
    // output: PathBuf,
}

fn main() -> anyhow::Result<()> {
    let opt = Cmd::try_parse()?;

    let mut input = String::new();
    File::open(opt.input)
        .expect("Failed to open input file")
        .read_to_string(&mut input)
        .expect("Failed to read input file");

    // parse input
    let pp = ParseParams {
        specifier: "file://".to_owned() + &input,
        text_info: SourceTextInfo::from_string(input),
        media_type: deno_ast::MediaType::Dts,
        capture_tokens: false,
        scope_analysis: true,
        maybe_syntax: None,
    };

    let parsed = parse_module(pp)?;
    let module = parsed.module();
    println!("{} items in module", module.body.len());
    let vscode_module = module.body[0].as_stmt().unwrap();
    let thenable_decl = module.body[1]
        .as_stmt()
        .cloned()
        .and_then(|stmt| stmt.decl())
        .and_then(|decl| decl.ts_interface())
        .unwrap();
    // vscode.d
    // - module
    // - interface (Thenable)
    // <EOF>
    dbg!(thenable_decl);

    Ok(())
}

impl Ts2Rs for TsTypeElement {
    type Out = syn::TraitItem;

    fn ts2rs(&self) -> Self::Out {
        match self {
            TsTypeElement::TsMethodSignature(sig) => sig.ts2rs(),
            TsTypeElement::TsConstructSignatureDecl(sig) => sig.ts2rs(),
            _ => unimplemented!(),
        }
    }
}

impl Ts2Rs for TsMethodSignature {
    type Out = syn::TraitItemMethod;

    fn ts2rs(&self) -> Self::Out {
        let name = self.key.ident().unwrap().to_string();
        let generics = &self.type_params.unwrap();
        let params = &self.params;
        let return_type = &self.type_ann;

        parse_quote! {
            fn #name #generics (#params) -> #return_type;
        }
    }
}

impl Ts2Rs for TsTypeParam {
    type Out = syn::GenericParam;

    fn ts2rs(&self) -> Self::Out {
        let name = self.name.to_string();
        let bounds = &self.constraint.unwrap();

        parse_quote! {
            #name: #bounds
        }
    }
}

impl Ts2Rs for TsInterfaceDecl {
    type Out = syn::Item;
    fn ts2rs(&self) -> Self::Out {
        let selfty = &self.id;
        let generics = &self.type_params;
        let extends = self.extends;

        let method_name = Vec::new();
        let method_generics = Vec::new();
        let method_params = Vec::new();
        let method_return_type = Vec::new();

        // go find all the methods
        for member in &self.body.body {
            match member {
                TsTypeElement::TsMethodSignature(sig) => {
                    method_name.push(&sig.key);
                    method_generics.push(&sig.type_params);
                    method_params.push(&sig.params);
                    method_return_type.push(&sig.type_ann);
                }
            }
        }

        parse_quote! {
            pub trait #selfty #generics {
                #(fn #method_name #method_generics (#method_params) -> #method_return_type;)*
            }
        }
    }
}