
export const UPDATE_CONFIG = 'UPDATE_CONFIG';

export function getConfig() {
  return dispatch => {
    return fetch('/getConfig')
      .then(response => response.json())
      .then(data => {
        dispatch({
          type: UPDATE_CONFIG,
          data,
        });
        return data;
      });
  };
}

let setConfigDelay;

export function setConfig(data) {
  return dispatch => {
    dispatch({
      type: UPDATE_CONFIG,
      data,
    });

    let currentSetConfigDelay;
    return new Promise(resolve => {
      currentSetConfigDelay = setConfigDelay = setTimeout(resolve, 1000);
    })
      .then(() => {
        if (currentSetConfigDelay === setConfigDelay) {
          return fetch('/setConfig', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(data),
          })
            .then(response => response.json())
            .then(data => {
              dispatch({
                type: UPDATE_CONFIG,
                data,
              });
              return data;
            });
        }
        return data;

      });
  };
}
