/** Примеры дней, вшитые автономной сборкой (vite.config.ts → examples()). В обычной сборке — null. */
declare module 'virtual:examples' {
  const data: unknown;
  export default data;
}
