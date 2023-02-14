/**
 * @fileoverview Convert typescript defs to rust bindgen defs
 */

import { runTests } from "@vscode/test-electron";
import { type } from "os";
import * as ts from "typescript";
import { format } from "util";

/**
 * Converts a .d.ts file to rust/wasm-bindgen compatible .rs file
 * @param file path to a .d.ts file
 * @param options
 */
function translateFiles(files: string[], options: ts.CompilerOptions): void {
  const program = ts.createProgram(files, options);
  const source = program.getSourceFile(files[0]);

  if (!source) {
    throw new Error(`Source file not found: ${files[0]}`);
  }
  if (!source.isDeclarationFile) {
    throw new Error(`Source file is not a declaration file: ${files[0]}`);
  }

  let out = "";
  source.forEachChild((node) => {
    if (ts.isModuleDeclaration(node)) {
      const outnode = txModule(node, (rust) => (out += rust));
      console.log(out);
      return outnode;
    }
  });
  console.log(out);
}

type Writer = (code: string) => void;

/**
 * Safely convert typescript types to the corresponding rust types
 * @param type the typescript type to convert
 * @returns string representation of the rust type
 */
function txTypeNode(type: ts.TypeNode): string {
  if (ts.isTypeReferenceNode(type)) {
    const { typeName, typeArguments } = type;
    if (typeArguments) {
      const args = typeArguments.map(txTypeNode);
      return `${typeName.getText()}<${args.join(", ")}>`;
    }
    return typeName.getText();
  } else if (ts.isLiteralTypeNode(type)) {
    return type.getText();
  } else if (ts.isUnionTypeNode(type)) {
    const types = type.types.map(txTypeNode);
    return `(${types.join(" + ")})`;
  } else if (ts.isFunctionTypeNode(type)) {
    const params = type.parameters.map((param) => {
      const type = txTypeNode(param.type!);
      return `${param.name.getText()}: ${type}`;
    });
    const ret = txTypeNode(type.type!);
    return `(${params.join(", ")}) -> ${ret}`;
  } else if (ts.isTypeLiteralNode(type)) {
    const members = type.members.map((member) => {
      if (ts.isPropertySignature(member)) {
        const type = txTypeNode(member.type!);
        return `${member.name.getText()}: ${type}`;
      } else if (ts.isMethodSignature(member)) {
        const params = member.parameters.map((param) => {
          const type = txTypeNode(param.type!);
          return `${param.name.getText()}: ${type}`;
        });
        const ret = txTypeNode(member.type!);
        return `fn(${params.join(", ")}) -> ${ret}`;
      }
    });
    return `{ ${members.join(", ")} }`;
  } else {
    return type.getText();
  }
}

function txClass(classDecl: ts.ClassDeclaration, w: Writer): ts.Node {
  const { name, members, typeParameters } = classDecl;
  const body: string[] = [];

  members.forEach((member) => {
    if (ts.isPropertyDeclaration(member)) {
      const type = member.questionToken ? `Option<${member.type}>` : member.type;
      body.push(`pub ${member.name}: ${type};`);
    } else if (ts.isMethodDeclaration(member)) {
      const params = member.parameters.map((param) => {
        const type = txTypeNode(param.type!);
        return `${param.name.getText()}: ${type}`;
      });
      const ret = txTypeNode(member.type!);
      body.push(
        `pub fn ${member.name.getText()}(${params.join(", ")}) -> ${ret};`
      );
    }
  });

  const typeParams = typeParameters?.map((param) => param.getText()).join(", ");
  w(`pub struct ${name} { ${body.join("\n")} }`);
  return classDecl;
}

/**
 * Convert a typescript enum to a rust enum
 * @param enumDecl the enum to convert
 * @param w a string -> void function that writes the output Rust
 * @returns the enum declaration
 */
function txEnum(enumDecl: ts.EnumDeclaration, w: Writer): ts.Node {
  const { name, members } = enumDecl;
  const body: string[] = [];

  members.forEach((member) => {
    if (ts.isEnumMember(member)) {
      body.push(`${member.getText()},`);
    }
  });

  w(`pub enum ${name} { ${body.join("\n")} }`);
  return enumDecl;
}

/**
 * Translate a top-level module declaration to a rust module
 * 
 * Child namespaces are just passed over to nested modules.
 * Modules can have namespaces, classes, enums, functions, interfaces, types.
 * We're literally just translating words here.
 * 
 * @param module the module to transliterate
 * @param writer a string -> void function that writes the output Rust
 * @returns
 */
function txModule(module: ts.Node, w: Writer): ts.Node {
  if (!ts.isModuleDeclaration(module)) return module;

  const body: string[] = [];
  module.forEachChild((child) => {
    // namespaces are just passed over to nested modules
    if (ts.isNamespaceExport(child) || ts.isModuleDeclaration(child)) {
      return txModule(child, (rust) => body.push(rust));
    }
    if (ts.isClassDeclaration(child)) {
      return txClass(child, (rust) => body.push(rust));
    }
    if (ts.isEnumDeclaration(child)) {
      return txEnum(child, (rust) => body.push(rust));
    }
    if (ts.isFunctionDeclaration(child)) {
      const params = child.parameters.map((param) => {
        const type = txTypeNode(param.type!);
        return `${param.name.getText()}: ${type}`;
      });
      const ret = txTypeNode(child.type!);
      body.push(`pub fn ${child.name.getText()}(${params.join(", ")}) -> ${ret};`);
    }
    if (ts.isInterfaceDeclaration(child)) {
      const params = child.typeParameters?.map((param) => param.getText());
      const typeParams = params ? `<${params.join(", ")}> ` : "";
      body.push(`pub trait ${typeParams}${child.name.getText()};`);
    }
  });

  const buf = `
    pub mod ${module.name.getText()} {
      use wasm_bindgen::prelude::*;

      #[wasm_bindgen]
      extern "C" {
        ${body}
      }
    }
    `;
  console.log(buf);
  w(buf);
  return module;
}

function main(args: string[]) {
  if (args.length === 0) {
    console.log("Usage: tsrs <file.ts>");
    process.exit(1);
  }
  translateFiles(args, {});
}

//const args = process.argv.slice(2);
const args = ["node_modules/@types/vscode/index.d.ts"];
console.log("Translating", args);
main(args);
