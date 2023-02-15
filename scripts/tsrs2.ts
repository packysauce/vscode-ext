import * as ts from "typescript";

// Emit rust module layout and wasm_bindgen attributes
// based on a typescript .d.ts file

/**
 * Represents a typescript module
 */
class Module {
    constructor(
        public name: string = "",
        public functions: ts.FunctionDeclaration[] = [],
        public classes: ts.ClassDeclaration[] = [],
        public interfaces: ts.InterfaceDeclaration[] = [],
        public enums: ts.EnumDeclaration[] = [],
        public typeAliases: ts.TypeAliasDeclaration[] = [],
        public namespaces: ts.ModuleDeclaration[] = [],
    ) {}

    static fromSourceFile(sourceFile: ts.SourceFile): Module {
        const module = new Module();

        for (const statement of sourceFile.statements) {
            if (ts.isFunctionDeclaration(statement)) {
                module.functions.push(statement);
            } else if (ts.isClassDeclaration(statement)) {
                module.classes.push(statement);
            } else if (ts.isInterfaceDeclaration(statement)) {
                module.interfaces.push(statement);
            } else if (ts.isEnumDeclaration(statement)) {
                module.enums.push(statement);
            } else if (ts.isTypeAliasDeclaration(statement)) {
                module.typeAliases.push(statement);
            } else if (ts.isModuleDeclaration(statement)) {
                module.namespaces.push(statement);
            }
        }

        return module;
    }

    // toRust(): string {
    //     const template = `
    //     pub mod ${this.name} {
    //         use wasm_bindgen::prelude::*;

    //         #[wasm_bindgen]
    //         extern "C" {
    //             ${this.functions.map((f) => f.toRust()).join("\n")}
    //         }
    //     }
    //     `;
    //     return template;
    // }
}

// function rustifyFunction(f: ts.FunctionDeclaration): string {
//     const params = f.parameters.map((param) => {
//         const type = txTypeNode(param.type!);
//         return `${param.name.getText()}: ${type}`;
//     });
//     const ret = txTypeNode(f.type!);
//     return `
//     #[wasm_bindgen]
//     pub fn ${f.name?.getText()}(${params.join(", ")}) -> ${ret};
//     `;
// }

// const filenames = process.argv.slice(2);
const filenames = ["node_modules/@types/vscode/index.d.ts"];

const host = ts.createCompilerHost({});
const program = ts.createProgram(filenames, {}, host);

const sourceFile = program.getSourceFile(filenames[0])!;

// very vscode specific for now:
// its a big ol export declare module, then "Thenable". Just Thenable.

for (const statement of sourceFile.statements) {
    // this is the "vscode" module
    if (ts.isModuleDeclaration(statement)) {
        console.log(statement);
    }
}

console.log(sourceFile);
