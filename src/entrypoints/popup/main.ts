import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

if (location.hash) document.documentElement.classList.add('tab');

export default mount(App, { target: document.getElementById('app')! });
