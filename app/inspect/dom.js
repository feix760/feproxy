
const projects = [
  {
    name: '旅行青蛙',
    enable: false,
    rules: [
      {
        enable: true,
        match: '(.*)',
        to: '$1',
      },
      {
        enable: true,
        match: '(.*)',
        to: '$1',
      },
    ],
    hosts: [
      {
        enable: false,
        host: 'www.baidu.com',
        ip: '127.0.0.1',
      },
    ],
  },
  {
    name: '舞动乾坤',
    enable: true,
    rules: [
      {
        enable: true,
        match: '(.*)',
        to: '$1',
      },
      {
        enable: true,
        match: '(.*)',
        to: '$1',
      },
    ],
    hosts: [
      {
        enable: false,
        host: 'www.baidu.com',
        ip: '127.0.0.1',
      },
    ],
  },
];

module.exports = inspect => { // eslint-disable-line
  const {
    frame
  } = inspect;

  const rootNodeId = 1;
  const projectsNodeId = 2;

  const dom = projects.map(item => {
    const projectId = inspect.nextId();
    return {
      attrs: {
        name: item.name || '',
        enable: item.enable || false,
      },
      attributes: [],
      backendNodeId: projectId,
      nodeId: projectId,
      parentId: projectsNodeId,
      localName: 'Project',
      nodeName: 'Project',
      nodeType: 1,
      nodeValue: '',
      childNodeCount: item.rules.length + item.hosts.length,
      children: [
        ...item.rules.map(item => {
          const id = inspect.nextId();
          return {
            attrs: {
              enable: item.enable || false,
              match: item.match || '',
              to: item.to || '',
            },
            attributes: [],
            backendNodeId: id,
            nodeId: id,
            parentId: projectId,
            localName: 'Rule',
            nodeName: 'Rule',
            nodeType: 1,
            nodeValue: '',
            childNodeCount: 0,
          };
        }),
        ...item.hosts.map(item => {
          const id = inspect.nextId();
          return {
            attrs: {
              enable: item.enable || false,
              host: item.host || '',
              ip: item.ip || '',
            },
            attributes: [],
            backendNodeId: id,
            nodeId: id,
            parentId: projectId,
            localName: 'Host',
            nodeName: 'Host',
            nodeType: 1,
            nodeValue: '',
            childNodeCount: 0,
          };
        }),
      ],
    };
  });

  const rootNode = {
    nodeId: rootNodeId,
    backendNodeId: rootNodeId,
    baseURL: frame.url,
    documentURL: frame.url,
    localName: '',
    nodeName: '#document',
    nodeType: 9,
    nodeValue: '',
    xmlVersion: '',
    childNodeCount: 1,
    children: [
      {
        nodeId: projectsNodeId,
        backendNodeId: projectsNodeId,
        parentId: rootNodeId,
        nodeName: 'Projects',
        nodeType: 1,
        nodeValue: '',
        attrs: {},
        attributes: [],
        childNodeCount: dom.length,
        children: [
          ...dom,
        ],
        frameId: frame.id,
        localName: 'Projects',
      },
    ],
  };

  const work = (root, fn) => {
    if (fn(root) === true) {
      return root;
    }
    const children = root.children || [];
    for (item of children) {
      const result = work(item, fn);
      if (result) {
        return result;
      }
    }
    return null;
  };

  const findByNodeId = (root, nodeId) => {
    return work(root, item => item.nodeId === nodeId);
  };

  const setAttributes = root => {
    work(root, item => {
      item.attributes = Object.keys(item.attrs || {}).reduce((o, k) => {
        o.splice(0, 0, k, item.attrs[k] + '');
        return o;
      }, []);
    });
    return root;
  };

  const methods = {
    'DOM.enable': () => ({
      result: true,
    }),
    'DOM.getDocument' () {
      return {
        root: setAttributes(rootNode),
      };
    },
    'DOM.requestChildNodes'(data, ws) {
      const { nodeId } = data.params;
      ws.send({
        method: 'DOM.setChildNodes',
        params: {
          parentId: nodeId,
          nodes: [],
        },
      });
      return {};
    },
    'DOM.resolveNode'(data, ws) {
      const { nodeId } = data.params;

      const node = findByNodeId(rootNode, nodeId);

      if (node.attrs) {
        node.attrs.enable = !node.attrs.enable;
        ws.send({
          method: 'DOM.attributeModified',
          params: {
            name : 'enable',
            nodeId,
            value : '' + node.attrs.enable,
          },
        });
      }
      return {};
    },
    'DOM.removeNode'(data, ws) {
      const { nodeId } = data.params;

      const node = findByNodeId(rootNode, nodeId);

      ws.send({
        method: 'DOM.childNodeRemoved',
        params: {
          parentNodeId: node && node.parentId || undefined,
          nodeId,
        },
      });

      return {};
    },
    'DOM.setAttributeValue'(data, ws) {
      const { nodeId, name, value } = data.params;

      const node = findByNodeId(rootNode, nodeId);
      if (node) {
        node.attrs[name] = value;

        ws.send({
          method: 'DOM.attributeModified',
          params: {
            name,
            nodeId,
            value,
          },
        });
      }

      return {};
    },
    'DOM.setAttributesAsText'(data, ws) {
      const { nodeId, text } = data.params;

      const node = findByNodeId(rootNode, nodeId);
      const match = text.match(/^([\w\-]+)(?:=(['"]?)(.*)\2)?$/);
      if (node && match) {
        const name = match[1];
        const value = match[3];

        node.attrs[name] = value;

        ws.send({
          method: 'DOM.attributeModified',
          params: {
            name,
            nodeId,
            value,
          },
        });
      }

      return {};
    },
    'DOM.copyTo'(data, ws) {
      const { nodeId } = data.params;

      return {};
    },
    'DOM.moveTo'(data, ws) {
      const { nodeId } = data.params;

      return {};
    },
  };

  return {
    methods,
  };
};
