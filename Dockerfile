FROM node
EXPOSE 1234
RUN apt-get update
RUN apt-get install -y osmctools
RUN apt-get upgrade -y
COPY . .
WORKDIR /server
RUN npm install
CMD ["npm", "start"]
