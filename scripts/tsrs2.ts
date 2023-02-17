import { exit } from "process";
import * as ts from "typescript";
import { comments } from "vscode";

// Emit rust module layout and wasm_bindgen attributes
// based on a typescript .d.ts file

/**
 * Extract comments from a node
 *
 * Comments look like this (but without the pipes, im lazy)
 * ```typescript
 * |**
 *  * The version of the editor.
 *  *|
 * ```
 *
 * Which get turned into rust-style comments like this:
 * ```rust
 * /// The version of the editor.
 * ```
 * @param node The node whose comments to extract
 * @returns string The extracted comments
 */
function extractComments(node: ts.Node): string {
  let comment = "";
  for (const doc of (node as any).jsDoc?.filter((d: any) => d.comment) || []) {
    comment += ts.getTextOfJSDocComment(doc.comment);
  }
  return comment;
}

/**
 * Rustify comment text
 * @param comments The comments to rustify
 * @returns string
 */
function rustifyComments(comments: string): string {
  return comments
    .split("\n")
    .map((line) => `/// ${line}`)
    .join("\n");
}

/**
 * Rustifies an enum
 * @param node The enum to rustify
 * @return string
 */
function rustifyEnum(node: ts.EnumDeclaration): string {
  const js_name = node.name.text;
  const comment = rustifyComments(extractComments(node));

  let rs = `
  ${comment}
  pub enum ${js_name} {\n`;
  node.members.forEach((member) => {
    const propName = toPascal((member.name as any).text);
    if (member.initializer) {
      const propValue = (member.initializer as any).text;
      rs += `    ${propName} = ${propValue},\n`;
    } else {
      rs += `    ${propName},\n`;
    }
  });
  rs += "}\n";
  return rs;
}

/**
 * Container for overloaded typescript functions
 *
 * Rust doesn't have overloaded functions, so I've chosen
 * to merge them into an enum with a variant for each
 * overload.
 */
class FunctionOverload {
  public name: string;
  public parameters: ts.NodeArray<ts.ParameterDeclaration>[];
  public returnTypes: ts.TypeNode[];
  public comment: string;

  constructor(node: ts.FunctionDeclaration) {
    if (node.name === undefined) {
      throw new Error("Function must have a name");
    }
    this.name = node.name.text;
    this.parameters = [node.parameters];
    const type =
      node.type ?? ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword);
    this.returnTypes = [type];
    this.comment = extractComments(node);
  }

  /**
   * Merge a function into this overload
   * @param node The function to merge into this overload
   */
  merge(other: FunctionOverload) {
    if (other.name !== this.name) {
      throw new Error(`Names differ (${other.name} != ${this.name})`);
    }
    this.parameters.push(other.parameters[0]);
    this.returnTypes.push(other.returnTypes[0]);
    // TODO: comments should be fine?
  }

  /**
   * Rustify this overload
   */
  rustify() {
    const name = toSnake(this.name);
    const params = this.parameters
      .map((params) => params.map((p) => rustifyParameter(p)).join(", "))
      .join(", ");
    const returnType = rustifyType(this.returnTypes[0]);
    // TODO: handle multiple return types
    return ` 
    ${rustifyComments(this.comment)}
    pub fn ${name}(${params}) -> ${returnType};
    `;
  }
}

/**
 * Rustify function parameters
 * @param node The parameter declaration to rustify
 * @return string
 */
function rustifyParameter(node: ts.ParameterDeclaration): string {
  const name = node.name.getText();
  let type = node.type ? rustifyType(node.type) : "JsValue";
  if (node.questionToken) {
    type = `Option<${type}>`;
  }
  return `${name}: ${type}`;
}

/**
 * Rustify type parameters
 */
function rustifyTypeParameters(
  typeParameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined
): string {
  if (!typeParameters) {
    return "";
  }
  return `<${typeParameters.map((p) => p.name.text).join(", ")}>`;
}

/**
 * Rustify a typescript intersection type
 * Intersections are basically unit structs; newtypey ways to add fields
 * @param node The intersection type to rustify
 * @return string
 */
function rustifyIntersection(node: ts.IntersectionTypeNode): string {
  // they look like this:
  // TraitA & TraitB
  // so we can promote them to a where clause
}

/**
 * Rustify a typescript type
 * @param node The type to rustify
 * @return string
 */
function rustifyType(node: ts.TypeNode | undefined): string {
  if (!node) {
    // TODO: maybe use JSDoc tag
    return "()";
  }
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "String";
    case ts.SyntaxKind.NumberKeyword:
      return "f64";
    case ts.SyntaxKind.BooleanKeyword:
      return "bool";
    case ts.SyntaxKind.VoidKeyword:
      return "()";
    case ts.SyntaxKind.AnyKeyword:
      return "JsValue";
    case ts.SyntaxKind.ArrayType:
      return `Vec<${rustifyType((node as ts.ArrayTypeNode).elementType)}>`;
    case ts.SyntaxKind.TupleType:
      return `(${(node as ts.TupleTypeNode).elements
        .map(rustifyType)
        .join(", ")})`;
    case ts.SyntaxKind.UnionType:
      // This will be tough as rust's closest thing would be an enum
      // and we have to go back and create enums :(
      // for now, check for stuff like 'T | undefined' and make em Optional
      const union = node as ts.UnionTypeNode;
      if (union.types.length !== 2) {
        throw new Error("Union types with more than 2 types not implemented");
      }
      const [first, second] = union.types;
      switch (second.kind) {
        case ts.SyntaxKind.TypeReference:
          const ref = second as ts.TypeReferenceNode;
          const typeName = ref.typeName.getText();
          if (ts.isTypeOperatorNode(first)) {
            switch (first.operator) {
              case ts.SyntaxKind.KeyOfKeyword:
                // TODO: translate to `K where T: Index<K>`
                throw new Error("KeyOf not implemented");
              case ts.SyntaxKind.UniqueKeyword:
                // TODO: translate to unit structs (uniques are atoms/symbols)
                throw new Error("Unique not implemented");
              case ts.SyntaxKind.ReadonlyKeyword:
                // TODO: depends on the usage? would be &T?
                return `&${rustifyType(first.type)}`;
            }
            console.log(typeName, first as ts.TypeOperatorNode);
          }
          break;
        case ts.SyntaxKind.UndefinedKeyword:
          return `Option<${rustifyType(first)}>`;
      }
      let dbg = (node as ts.UnionTypeNode).types.map(
        (t) => ts.SyntaxKind[t.kind]
      );
      throw new Error(`Unknown union type ${dbg}`);
    case ts.SyntaxKind.TypeReference:
      const ref = node as ts.TypeReferenceNode;
      const typeName = ts.idText(ref.typeName as ts.Identifier);
      if (ref.typeArguments) {
        return `${typeName}<${ref.typeArguments
          .map((arg) => rustifyType(arg))
          .join(", ")}>`;
      } else {
        return typeName;
      }
    case ts.SyntaxKind.FunctionType:
      const func = node as ts.FunctionTypeNode;
      const params = func.parameters.map(rustifyParameter).join(", ");
      const returnType = rustifyType(func.type);
      return `Box<dyn Fn(${params}) -> ${returnType}>`;
  }
  throw new Error(`Unknown type ${ts.SyntaxKind[node.kind]}`);
}

/**
 * Represents a typescript module
 */
class Module {
  constructor(
    public comment: string = "",
    public name: string = "",
    public variables: ts.VariableDeclaration[] = [],
    public functions: Map<string, FunctionOverload> = new Map(),
    public classes: ts.ClassDeclaration[] = [],
    public interfaces: ts.InterfaceDeclaration[] = [],
    public enums: ts.EnumDeclaration[] = [],
    public typeAliases: ts.TypeAliasDeclaration[] = [],
    public namespaces: Module[] = []
  ) {}

  /**
   * Write this module with an output function
   *
   * @param writer A function that writes a string to the output
   */
  emit(writer: (s: string) => void) {
    writer(this.comment);
    writer(`pub mod ${this.name} {\n`);
    // this.variables.forEach((v) => writer(rustifyVariable(v)));
    this.functions.forEach((f) => writer(f.rustify()));
    // this.classes.forEach((c) => writer(rustifyClass(c)));
    // this.interfaces.forEach((i) => writer(rustifyInterface(i)));
    // this.enums.forEach((e) => writer(rustifyEnum(e)));
    // this.typeAliases.forEach((t) => writer(rustifyTypeAlias(t)));
    const indented = (s: string) => writer(`  ${s}`);
    this.namespaces.forEach((n) => n.emit(indented));
    writer("}\n");
  }

  static fromModule(node: ts.Node): Module {
    const m = new Module();
    m.comment = rustifyComments(extractComments(node));

    ts.forEachChild(node, (child) => {
      switch (child.kind) {
        case ts.SyntaxKind.Identifier:
          m.name = ts.idText(child as ts.Identifier);
          break;
        case ts.SyntaxKind.StringLiteral:
          m.name = (child as ts.StringLiteral).text;
          break;
        case ts.SyntaxKind.ModuleBlock:
          ts.forEachChild(child, (blockChild) => {
            switch (blockChild.kind) {
              case ts.SyntaxKind.VariableDeclaration:
                m.variables.push(blockChild as ts.VariableDeclaration);
                break;
              case ts.SyntaxKind.FunctionDeclaration:
                const overload = new FunctionOverload(
                  blockChild as ts.FunctionDeclaration
                );
                if (m.functions.has(overload.name)) {
                  m.functions.get(overload.name)?.merge(overload);
                } else {
                  m.functions.set(overload.name, overload);
                }
                break;
              case ts.SyntaxKind.ClassDeclaration:
                m.classes.push(blockChild as ts.ClassDeclaration);
                break;
              case ts.SyntaxKind.InterfaceDeclaration:
                m.interfaces.push(blockChild as ts.InterfaceDeclaration);
                break;
              case ts.SyntaxKind.EnumDeclaration:
                m.enums.push(blockChild as ts.EnumDeclaration);
                break;
              case ts.SyntaxKind.TypeAliasDeclaration:
                m.typeAliases.push(blockChild as ts.TypeAliasDeclaration);
                break;
              case ts.SyntaxKind.ModuleDeclaration:
                m.namespaces.push(Module.fromModule(blockChild));
                break;
            }
          });
          break;
      }
    });
    return m;
  }
}

function toSnake(s: string) {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function toPascal(s: string) {
  return s
    .split("_")
    .map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
    .join("");
}

function main() {
  // const filenames = process.argv.slice(1);
  const filenames = ["node_modules/@types/vscode/index.d.ts"];

  const host = ts.createCompilerHost({}, true);
  const program = ts.createProgram(filenames, {}, host);
  const sourceFile = program.getSourceFile(filenames[0]);
  if (!sourceFile) {
    console.error("no source file");
    exit(1);
  }

  const modules: Module[] = [];

  // very vscode specific for now:
  // its a big ol export declare module, then "Thenable". Just Thenable.
  ts.forEachChild(sourceFile, (node) => {
    // this is the "vscode" module
    if (ts.isModuleDeclaration(node)) {
      const m = Module.fromModule(node);
      modules.push(m);
    }
  });

  // TODO: use host.writeFile to write
  console.log(`use wasm_bindgen::prelude::*;`);
  modules.forEach(emitModule);

  console.error("🎉 finished at " + new Date().toLocaleTimeString());
}

function emitModule(module: Module) {
  console.log(`
  ${module.comment}
  pub mod ${module.name} {
    use super::*;
  `);
  for (const ns of module.namespaces) {
    emitModule(ns);
  }
  console.log(`#[wasm_bindgen(module = "${module.name}")]`);
  console.log('extern "C" {');
  for (const [fn_name, overloads] of module.functions.entries()) {
    console.log(overloads.rustify());
  }
  console.log("}");
  for (const en of module.enums) {
    //console.log(rustifyEnum(en));
  }
  console.log("}");
}

main();
