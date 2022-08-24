import matplotlib.pyplot as plt
import seaborn as sns

import requests
import time

def reshape(keys, server_data):
    data_list = [[] for _ in keys]

    for sample in server_data:
        for i, key in enumerate(keys):
            data_list[i].append(sample[key])

    return data_list


color_map = [
    '#B44D64',
    '#FB946B',
    '#FFBC72',
    '#F2D9B1',
    '#101F5C',
    '#316CA6'
]

URL = 'http://127.0.0.1:5000/'

sample_endpoint = 'since/'
last_endpoint = 'last/'
plug_name_endpoint = 'plugs'

data = requests.get(url=URL+plug_name_endpoint).json()
plug_names = data['names']

data = requests.get(url=URL+last_endpoint+'10s').json()
plug_data = reshape(plug_names, data)
last_timestamp = data[-1]['time']
print(f"Got {len(data)} samples")

sns.set_theme()
plt.ion()
plt.show()
plt.stackplot(range(len(plug_data[0])), plug_data, colors=color_map, labels=plug_names)
ax = plt.gca()
handles, labels = ax.get_legend_handles_labels()
ax.legend(reversed(handles), reversed(labels), loc='lower left')

while True:
    data = requests.get(url = URL+last_endpoint+'1m').json()

    if data:
        last_timestamp = data[-1]['time']
        print(f"Got {len(data)} samples")

        # for old, new in zip(plug_data, reshape(plug_names, data)):
        #     old.extend(new)
        plug_data = reshape(plug_names, data)

        x = range(len(plug_data[0]))
        plt.clf()
        plt.stackplot(x, plug_data, colors=color_map, labels=plug_names)
        plt.draw()
        plt.pause(.001)
        
    time.sleep(3)

