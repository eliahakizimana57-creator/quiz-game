// Quiz question bank - add or edit questions here
const questions = [
  {
    id: 1,
    question: "What is the capital of France?",
    options: ["Berlin", "Madrid", "Paris", "Rome"],
    correct: 2, // index of correct answer (0-based)
    timeLimit: 20
  },
  {
    id: 2,
    question: "Which planet is known as the Red Planet?",
    options: ["Earth", "Mars", "Jupiter", "Venus"],
    correct: 1,
    timeLimit: 20
  },
  {
    id: 3,
    question: "What is 12 × 12?",
    options: ["124", "144", "132", "156"],
    correct: 1,
    timeLimit: 15
  },
  {
    id: 4,
    question: "Who wrote 'Romeo and Juliet'?",
    options: ["Charles Dickens", "Mark Twain", "William Shakespeare", "Jane Austen"],
    correct: 2,
    timeLimit: 20
  },
  {
    id: 5,
    question: "What is the chemical symbol for water?",
    options: ["O2", "CO2", "H2O", "NaCl"],
    correct: 2,
    timeLimit: 15
  },
  {
    id: 6,
    question: "How many continents are there on Earth?",
    options: ["5", "6", "7", "8"],
    correct: 2,
    timeLimit: 20
  },
  {
    id: 7,
    question: "Which country invented the internet?",
    options: ["Japan", "United Kingdom", "Germany", "United States"],
    correct: 3,
    timeLimit: 20
  },
  {
    id: 8,
    question: "What is the largest ocean on Earth?",
    options: ["Atlantic", "Indian", "Arctic", "Pacific"],
    correct: 3,
    timeLimit: 20
  },
  {
    id: 9,
    question: "What does 'HTML' stand for?",
    options: [
      "HyperText Markup Language",
      "HighText Machine Language",
      "HyperText and Links",
      "Hyper Transfer Markup Language"
    ],
    correct: 0,
    timeLimit: 20
  },
  {
    id: 10,
    question: "Which animal is the fastest on land?",
    options: ["Lion", "Horse", "Cheetah", "Leopard"],
    correct: 2,
    timeLimit: 20
  }
];

module.exports = questions;
