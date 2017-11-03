FROM node:8
EXPOSE 1234
RUN apt-get update
RUN apt-get install -y osmctools
RUN apt-get upgrade -y
RUN git clone https://github.com/GIScience/OSM-realtime-update
WORKDIR /OSM-realtime-update/server
RUN npm install
CMD ["npm", "start"]
