/**
 * CSS Modules are resolved by the bundler, not by TypeScript. Without this
 * declaration every `import styles from './X.module.css'` is an unresolved
 * module, and the alternative — turning the error off — would hide genuine
 * missing imports too.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
