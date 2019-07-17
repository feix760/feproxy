
module.exports = inspector => {
  const { frame } = inspector;

  inspector.on('message', ({ msg, ws }) => {
    switch (msg.method) {
      case 'Inspector.enable':
        ws.send({
          method: 'Runtime.executionContextCreated',
          params: {
            context: {
              id: frame.contextId,
              name: frame.contextName,
              origin: '',
              auxData: {
                frameId: frame.id,
                isDefault: true,
              },
            },
          },
        });
        break;
      default:
        break;
    }
  });

  return {
    methods: {
      'Page.getResourceContent': () => ({
        base64Encoded: false,
        content: 'no content',
      }),
      'Page.getResourceTree': () => ({
        frameTree: {
          frame,
          resources: [],
        },
      }),
    },
  };
};
