import { murmurHash3 } from './src/murmurHash3.js';
import { calculateHashValue } from './src/calculateHashValue.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate hash values for test vectors
const testVectors = {
  "description": "Shared test vectors for cross-platform validation of MurmurHash3 implementation",
  "version": "1.0.0",
  "vectors": [
    {
      "description": "Empty string",
      "input": "",
      "seed": 0,
      "expectedHash": murmurHash3('', 0)
    },
    {
      "description": "Single character",
      "input": "a",
      "seed": 0,
      "expectedHash": murmurHash3('a', 0)
    },
    {
      "description": "Simple string",
      "input": "hello",
      "seed": 0,
      "expectedHash": murmurHash3('hello', 0)
    },
    {
      "description": "Flag key concatenation example",
      "input": "flag-key.salt.user-123",
      "seed": 0,
      "expectedHash": murmurHash3('flag-key.salt.user-123', 0)
    },
    {
      "description": "Unicode characters",
      "input": "hello🌍world",
      "seed": 0,
      "expectedHash": murmurHash3('hello🌍world', 0)
    },
    {
      "description": "Long string",
      "input": "this-is-a-very-long-string-that-tests-multiple-blocks-in-the-hash-algorithm-implementation",
      "seed": 0,
      "expectedHash": murmurHash3('this-is-a-very-long-string-that-tests-multiple-blocks-in-the-hash-algorithm-implementation', 0)
    },
    {
      "description": "Special characters",
      "input": "flag!@#$%^&*()_+-=[]{}|;:',.<>?",
      "seed": 0,
      "expectedHash": murmurHash3("flag!@#$%^&*()_+-=[]{}|;:',.<>?", 0)
    },
    {
      "description": "Non-zero seed",
      "input": "test",
      "seed": 42,
      "expectedHash": murmurHash3('test', 42)
    }
  ],
  "bucketValueExamples": [
    {
      "description": "Basic flag evaluation",
      "flagKey": "my-flag",
      "contextKey": "user-123",
      "salt": "salt-value"
    },
    {
      "description": "Empty salt",
      "flagKey": "feature-flag",
      "contextKey": "user-456",
      "salt": ""
    },
    {
      "description": "Unicode in context key",
      "flagKey": "test-flag",
      "contextKey": "user-🌍",
      "salt": "salt"
    },
    {
      "description": "Special characters",
      "flagKey": "flag!@#",
      "contextKey": "user$%^",
      "salt": "salt&*()"
    },
    {
      "description": "Long keys",
      "flagKey": "very-long-flag-key-with-many-characters",
      "contextKey": "very-long-context-key-with-many-characters",
      "salt": "very-long-salt-with-many-characters"
    }
  ]
};

// Generate bucket value examples
testVectors.bucketValueExamples = testVectors.bucketValueExamples.map(example => {
  const result = calculateHashValue(example.flagKey, example.contextKey, example.salt);
  return {
    ...example,
    expectedHashValue: result.hashValue,
    expectedBucketValue: result.bucketValue
  };
});

// Write to test-vectors.json
const outputPath = path.join(__dirname, '../../test-vectors.json');
fs.writeFileSync(outputPath, JSON.stringify(testVectors, null, 2));

console.log('Test vectors generated successfully!');
console.log('Output:', outputPath);
console.log('\nGenerated hashes:');
testVectors.vectors.forEach(v => {
  console.log(`  ${v.description}: ${v.expectedHash}`);
});
console.log('\nGenerated bucket values:');
testVectors.bucketValueExamples.forEach(v => {
  console.log(`  ${v.description}: hash=${v.expectedHashValue}, bucket=${v.expectedBucketValue}`);
});
