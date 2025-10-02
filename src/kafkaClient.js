const { Kafka } = require('kafkajs');

const brokers = [process.env.KAFKA_BROKERS];
const kafka = new Kafka({
  clientId: 'project-sentry',
  brokers,
  ssl: true,
  sasl: {
    mechanism: 'plain',
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD
  }
});

const producer = kafka.producer();

async function initProducer() {
  await producer.connect();
}

async function sendMessage(topic, payload) {
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(payload) }]
  });
}

async function createConsumer(groupId, topics, eachMessage) {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  for (const t of topics) {
    await consumer.subscribe({ topic: t, fromBeginning: false });
  }
  await consumer.run({ eachMessage });
  return consumer;
}

module.exports = { initProducer, sendMessage, createConsumer };
