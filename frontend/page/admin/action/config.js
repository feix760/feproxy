
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

let setConfigRequest;
let setConfigRequestData;

export function setConfig(data) {
  return dispatch => {
    dispatch({
      type: UPDATE_CONFIG,
      data,
    });
    setConfigRequestData = data;

    if (!setConfigRequest) {
      setConfigRequest = new Promise(resolve => setTimeout(resolve, 1000))
        .then(() => {
          return fetch('/setConfig', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(setConfigRequestData),
          });
        })
        .then(response => response.json())
        .then(data => {
          dispatch({
            type: UPDATE_CONFIG,
            data,
          });
          setConfigRequest = null;
          return data;
        });
    }
    return setConfigRequest;
  };
}
