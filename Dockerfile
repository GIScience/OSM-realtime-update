FROM node:8
EXPOSE 1234
RUN apt-get update
RUN apt-get install -y osmctools
RUN apt-get upgrade -y
RUN git clone https://gitlab.gistools.geog.uni-heidelberg.de/giscience/realtime_osm/realtime_osm
WORKDIR /realtime_osm/server
RUN npm install
CMD ["npm", "start"]
