import asyncio
from kasa import SmartStrip
from threading import Thread, Lock

from flask import Flask, json
from flask_cors import CORS

import time
import configparser


class PowerDatabase:
    '''
    data format:
    [
        {
            time: <timestamp>,
            plug_1: <power>,
            plug_2: <power>,
            ...
            plug_n: <power>
        }
    ]
    '''

    HOURS_PER_DAY = 24
    MINS_PER_HOUR = 60
    SECS_PER_MIN = 60
    MILLIS_PER_SEC = 1000

    def __init__(self):
        self._history = []
        self.names = None
        self._limit = None

        self._lock = Lock()

    def add(self, time, sample):
        new_sample = { 'time': time }
        for device, name in zip(sample, self.names):
            new_sample[name] = device.power

        with self._lock:
            self._history.append(new_sample)

    @property
    def last(self):
        with self._lock:
            return self._history[-1]

    @property
    def limit(self):
        return self._limit / self.MILLIS_PER_SEC / self.SECS_PER_MIN / self.MINS_PER_HOUR / self.HOURS_PER_DAY

    @limit.setter
    def limit(self, x):
        self._limit = x * self.HOURS_PER_DAY * self.MINS_PER_HOUR * self.SECS_PER_MIN * self.MILLIS_PER_SEC
        
    def get_data_since(self, timestamp):
        with self._lock:
            idx = self._find_timestamp_idx(timestamp)
            return self._history[idx:] if idx is not None else None

    def _find_timestamp_idx(self, timestamp):
        return next((idx for idx, val in enumerate(map(lambda x : x['time'], self._history)) if val > timestamp), None)

    def prune(self):
        if self._limit is None:
            return

        latest_time = self._history[-1]['time']
        self._history = [sample for sample in self._history if latest_time - sample['time'] < self._limit]

    def __len__(self):
        return len(self._history)


class PowerCollector:

    def __init__(self, address):
        self._address = address
        self._t1 = None

    def start(self, database):
        self._t1 = Thread(target=self._collection, args=(database,))
        self._t1.start()

    async def _power_collector(self, database):
        strip = SmartStrip(self._address)

        while True:
            await strip.update()
            power_usage = await asyncio.gather(
                *[plug.get_emeter_realtime() for plug in strip.children]
            )
            database.add(int(1000*time.time()), power_usage)
            database.prune()
            print(f"New sample at {database.last['time']}")

    def _collection(self, database):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        loop.run_until_complete(self._power_collector(database))
        loop.close()


def parse_config(filename):
    # Set defaults
    max_plugs = 6
    plug_names = [f"Plug {i}" for i in range(1, max_plugs+1)]
    history_depth = 30

    # Read config file
    config = configparser.ConfigParser()
    config.read(filename)

    # Make sure we have the ip address for the power strip defined. If not,
    # we need to error out
    if not 'strip_address' in config['General']:
        print("Error: address defined for the power strip")
        return
    strip_ip = config['General']['strip_address']

    # If a different history length has been defined, set it
    if 'history' in config['General']:
        history_depth = int(config['General']['history'])

    # Read in plug aliases defined in config
    for override_name in config.items('Alias'):
        (plug_idx, new_name) = override_name
        plug_idx = int(plug_idx)
        if plug_idx not in range (1, max_plugs+1):
            print(f"Warning: custom alias isn't in range: {plug_idx}")
            continue
        plug_names[plug_idx-1] = new_name

    return (strip_ip, history_depth, plug_names)


def main():

    # Parse the config files
    (ip, hist_depth, plug_names) = parse_config('config.ini')

    # Set up producer and consumer
    pc = PowerCollector(ip)
    pd = PowerDatabase()

    # Set the plug names in the database
    pd.names = plug_names
    pd.limit = hist_depth

    # Use flask for sharing data
    api = Flask(__name__)
    CORS(api)

    # GET power consumption
    @api.route('/since/<timestamp>', methods=['GET'])
    def get_power_samples(timestamp=0):
        return json.dumps(pd.get_data_since(int(timestamp)))

    @api.route('/last/<period>')
    def get_last_samples(period):
        conversion = {
            's': pd.MILLIS_PER_SEC,
            'm': pd.SECS_PER_MIN * pd.MILLIS_PER_SEC,
            'h': pd.MINS_PER_HOUR * pd.SECS_PER_MIN * pd.MILLIS_PER_SEC,
        }

        time_unit = period[-1]
        conversion_factor = conversion[time_unit]
        time_len = int(period[:-1]) * conversion_factor
        time_ago = (time.time()*1000) - time_len

        return json.dumps(pd.get_data_since(time_ago))

    # GET node names
    @api.route('/plugs', methods=['GET'])
    def get_plug_names():
        return json.dumps({'names':pd.names})

    # Start collecting data
    pc.start(pd)

    # Start Flask server
    api.run()
    
    
if __name__ == '__main__':
    main()    

