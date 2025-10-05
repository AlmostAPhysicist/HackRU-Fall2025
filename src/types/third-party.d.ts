// Third-party module fallbacks for editor/type-checker when types are missing
declare module '@google/genai' {
  export class GoogleGenAI {
    constructor(options: { apiKey: string });
    models: {
      generateContent(opts: any): Promise<any>;
    };
  }
  export default GoogleGenAI;
}

declare module '@astrojs/netlify' {
  const fn: any;
  export default fn;
}

declare module '@astrojs/netlify/functions' {
  const fn: any;
  export default fn;
}

declare module '@astrojs/node' {
  const fn: any;
  export default fn;
}
