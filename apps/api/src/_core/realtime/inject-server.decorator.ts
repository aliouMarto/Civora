// Placeholder decorator — la gateway injecte le server via setServer() au afterInit.
// Conservé pour la lisibilité et une future migration vers un token d'injection dédié.
export const InjectWebSocketServer = (): PropertyDecorator => () => {};
