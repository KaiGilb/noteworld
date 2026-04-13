import pluginVue from 'eslint-plugin-vue'

export default [
  ...pluginVue.configs['flat/essential'],
  {
    rules: {
      'no-unused-vars': 'error'
    }
  }
]
