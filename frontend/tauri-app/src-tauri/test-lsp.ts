// Test file for backend LSP diagnostics verification
// This file contains intentional errors for testing

// Type assignment errors
const x: string = 123; // Error: Type 'number' is not assignable to type 'string'

// Typo in console method
cole.log("test"); // Error: Cannot find name 'cole'. Did you mean 'console'?

// Unused variable
const unused = 5; // Warning: 'unused' is declared but never used

// Missing semicolon (depends on linter settings)
function test() {
    return "hello"
} // Potential warning: Missing semicolon

// Function with implicit return type
function add(a: number, b: number) {
    return a + b; // No error, but could suggest explicit return type
}

// Null safety error
function processString(str: string) {
    return str.toUpperCase();
}
processString(null); // Error: Argument of type 'null' is not assignable to parameter of type 'string'