import app from './src/app.js';

const PORTA = process.env.PORT || 3000;

app.listen(PORTA, () => {
    console.log(`Servidor rodando na porta http://localhost:${PORTA}`);
});
